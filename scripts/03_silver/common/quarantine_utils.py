"""
Common utilities for quarantine handling in silver layer.

Provides validation helpers and quarantine reason formatting per company standards:
- Quarantine reason format: {TYPE}_{COLUMN_NAME} (e.g. Invalid_Id, Name_NULL_or_EMPTY).
- Multiple reasons are semicolon-separated.
- Added columns: quarantine_reason (string), quarantine_timestamp (timestamp).

Author: Cheng Wang
Contact: cheng.wang@myteam.com
Date / Last Modified: 2026-03-04
"""

from __future__ import annotations

from typing import Optional

from pyspark.sql import DataFrame
from pyspark.sql import functions as F
from pyspark.sql.column import Column


def add_quarantine_columns(df: DataFrame) -> DataFrame:
    """
    Add quarantine metadata columns to a DataFrame.

    Adds:
    - quarantine_reason: string, initially empty; populated by validation functions.
    - quarantine_timestamp: timestamp, set when row has at least one reason (e.g. on write).

    Args:
        df: Input DataFrame.

    Returns:
        DataFrame with quarantine_reason and quarantine_timestamp columns added.
    """
    return (
        df.withColumn("quarantine_reason", F.lit(""))
        .withColumn("quarantine_timestamp", F.lit(None).cast("timestamp"))
    )


def _append_quarantine_reason(df: DataFrame, condition: Column, reason: str) -> DataFrame:
    """Append a reason to quarantine_reason when condition is true; semicolon-separated."""
    return df.withColumn(
        "quarantine_reason",
        F.when(
            condition,
            F.when(
                F.trim(F.col("quarantine_reason")) == "",
                F.lit(reason),
            ).otherwise(
                F.concat(F.col("quarantine_reason"), F.lit(";"), F.lit(reason)),
            ),
        ).otherwise(F.col("quarantine_reason")),
    )


def validate_id_column(
    df: DataFrame,
    column_name: str,
    reason_prefix: str = "Invalid",
    allow_null: bool = False,
) -> DataFrame:
    """
    Validate ID column: not null (if allow_null=False) and not empty string.

    Appends reason in format {reason_prefix}_{column_name} (e.g. Invalid_Id)
    to quarantine_reason when the value is null or empty.

    Args:
        df: DataFrame with quarantine_reason column (from add_quarantine_columns).
        column_name: Name of the ID column to validate.
        reason_prefix: Prefix for the reason string; default "Invalid".
        allow_null: If True, nulls are allowed and only empty string is invalid.

    Returns:
        DataFrame with updated quarantine_reason.
    """
    reason = f"{reason_prefix}_{column_name}"
    invalid = F.col(column_name).isNull() | (F.trim(F.col(column_name)) == "")
    if allow_null:
        invalid = F.trim(F.col(column_name)) == ""
    return _append_quarantine_reason(df, invalid, reason)


def validate_name_column(
    df: DataFrame,
    column_name: str,
    min_length: int = 1,
    max_length: Optional[int] = None,
    allow_null: bool = False,
    reason_prefix: str = "Name",
) -> DataFrame:
    """
    Validate name-like column: not null/empty (unless allow_null) and length within range.

    Appends reason in format {reason_prefix}_{column_name} (e.g. Name_NULL_or_EMPTY,
    Invalid_ChannelName) to quarantine_reason when invalid.

    Args:
        df: DataFrame with quarantine_reason column.
        column_name: Name of the column to validate.
        min_length: Minimum non-empty length.
        max_length: Maximum allowed length; None for no limit.
        allow_null: If True, nulls are allowed.
        reason_prefix: Prefix for reason string.

    Returns:
        DataFrame with updated quarantine_reason.
    """
    is_null_or_empty = F.col(column_name).isNull() | (F.trim(F.col(column_name)) == "")
    if not allow_null:
        df = _append_quarantine_reason(df, is_null_or_empty, f"{reason_prefix}_NULL_or_EMPTY")
    too_short = ~is_null_or_empty & (F.length(F.trim(F.col(column_name))) < min_length)
    df = _append_quarantine_reason(
        df, too_short, f"Invalid_{column_name}_min_length_{min_length}"
    )
    if max_length is not None:
        too_long = F.length(F.trim(F.col(column_name))) > max_length
        df = _append_quarantine_reason(
            df, too_long, f"Invalid_{column_name}_max_length_{max_length}"
        )
    return df


def validate_required_not_empty(
    df: DataFrame,
    column_name: str,
    reason_type: str = "NULL_or_EMPTY",
) -> DataFrame:
    """
    Require column to be non-null and non-empty (after trim).

    Appends reason {column_name}_{reason_type} to quarantine_reason when invalid.

    Args:
        df: DataFrame with quarantine_reason column.
        column_name: Column to check.
        reason_type: Suffix for reason string.

    Returns:
        DataFrame with updated quarantine_reason.
    """
    invalid = F.col(column_name).isNull() | (F.trim(F.col(column_name).cast("string")) == "")
    return _append_quarantine_reason(df, invalid, f"{column_name}_{reason_type}")


def validate_numeric_column(
    df: DataFrame,
    column_name: str,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    allow_null: bool = True,
    reason_prefix: str = "Invalid",
) -> DataFrame:
    """
    Validate numeric column: optional range and nullability.

    Appends reason {reason_prefix}_{column_name} when value is null (if allow_null=False)
    or outside [min_value, max_value].
    """
    reason = f"{reason_prefix}_{column_name}"
    invalid = F.lit(False)
    if not allow_null:
        invalid = invalid | F.col(column_name).isNull()
    if min_value is not None:
        invalid = invalid | (F.col(column_name) < min_value)
    if max_value is not None:
        invalid = invalid | (F.col(column_name) > max_value)
    return _append_quarantine_reason(df, invalid, reason)


def set_quarantine_timestamp(df: DataFrame) -> DataFrame:
    """
    Set quarantine_timestamp to current timestamp for rows that have a non-empty quarantine_reason.

    Call after all validations; useful before writing to quarantine table.
    """
    return df.withColumn(
        "quarantine_timestamp",
        F.when(
            F.length(F.trim(F.col("quarantine_reason"))) > 0,
            F.current_timestamp(),
        ).otherwise(F.col("quarantine_timestamp")),
    )


def filter_invalid_records(df: DataFrame) -> DataFrame:
    """
    Return only rows that have at least one quarantine reason (invalid records).

    Trims leading semicolon from quarantine_reason for consistency.
    Typically used to obtain the subset to write to silver_{data_source}_quarantined.

    Args:
        df: DataFrame with quarantine_reason column.

    Returns:
        DataFrame containing only rows where quarantine_reason is non-empty after trim.
    """
    return (
        df.filter(F.length(F.trim(F.col("quarantine_reason"))) > 0)
        .withColumn(
            "quarantine_reason",
            F.trim(F.regexp_replace(F.col("quarantine_reason"), r"^;+", "")),
        )
    )


def filter_valid_records(df: DataFrame) -> DataFrame:
    """
    Return only rows with no quarantine reason (valid records).

    Use for writing to cleaned silver table.
    """
    return df.filter(F.trim(F.col("quarantine_reason")) == "")
