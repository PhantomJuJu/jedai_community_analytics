"""
SCD Type 2 merge utilities for silver layer.

Implements hash-based change detection: close current row (valid_to, is_current=0)
when data hash changes, and insert new row (valid_from, valid_to=null, is_current=1).
Uses columns valid_from, valid_to, is_current per company standards.

Author: Cheng Wang
Contact: cheng.wang@myteam.com
Date / Last Modified: 2026-03-04
"""

from typing import List, Optional

from pyspark.sql import SparkSession
from pyspark.sql import DataFrame
from pyspark.sql import functions as F
from pyspark.sql.column import Column

# Standard SCD Type 2 columns (snake_case per project rules)
SCD2_COLUMNS = ["valid_from", "valid_to", "is_current"]


def _data_hash_expr(df: DataFrame, exclude_columns: List[str]) -> Column:
    """Build SHA2 hash expression over all columns except exclude_columns."""
    data_cols = [c for c in df.columns if c not in exclude_columns]
    if not data_cols:
        raise ValueError("At least one data column required for hash")
    concat_expr = F.concat_ws(
        "||",
        *[F.coalesce(F.col(c).cast("string"), F.lit("")) for c in data_cols],
    )
    return F.sha2(concat_expr, 256)


def scd_type2_merge(
    spark: SparkSession,
    source_df: DataFrame,
    target_table: str,
    key_columns: List[str],
    *,
    exclude_from_hash: Optional[List[str]] = None,
) -> None:
    """
    Perform SCD Type 2 merge: close changed current rows and insert new/updated rows.

    Logic:
    - Rows in source with key not in target (is_current=1) → insert as new (valid_from=now, valid_to=null, is_current=1).
    - Rows in source with same key as target current and same data hash → no change.
    - Rows in source with same key as target current but different data hash → close target row (valid_to=now, is_current=0) and insert source row (valid_from=now, valid_to=null, is_current=1).
    - Target rows with is_current=0 are left unchanged (history).

    Args:
        spark: SparkSession.
        source_df: DataFrame with current snapshot; must contain key_columns and business attributes.
                  If valid_from/valid_to/is_current are missing, they are added.
        target_table: Full table name (catalog.schema.table) to read and overwrite.
        key_columns: Natural key column names (e.g. ["guild_id"] or ["channel_id", "snapshot_date"]).
        exclude_from_hash: Columns to exclude from hash; default valid_from, valid_to, is_current.
    """
    exclude = exclude_from_hash if exclude_from_hash is not None else SCD2_COLUMNS
    for col_name in key_columns:
        if col_name not in source_df.columns:
            raise ValueError(f"Key column {col_name} not in source DataFrame")

    # Ensure source has SCD2 columns; add if missing
    for scd_col in SCD2_COLUMNS:
        if scd_col not in source_df.columns:
            if scd_col == "valid_from":
                source_df = source_df.withColumn("valid_from", F.current_timestamp())
            elif scd_col == "valid_to":
                source_df = source_df.withColumn("valid_to", F.lit(None).cast("timestamp"))
            elif scd_col == "is_current":
                source_df = source_df.withColumn("is_current", F.lit(1).cast("int"))

    hash_expr = _data_hash_expr(source_df, exclude)
    source_with_hash = source_df.withColumn("_data_hash", hash_expr)

    # Read existing target
    existing_df = spark.table(target_table)
    existing_with_hash = existing_df.withColumn(
        "_data_hash",
        _data_hash_expr(existing_df, exclude),
    )
    current_df = existing_with_hash.filter(F.col("is_current") == 1)
    history_df = existing_with_hash.filter(F.col("is_current") == 0).drop("_data_hash")

    # Join condition on key
    join_cond = None
    for k in key_columns:
        c = F.col("source." + k) == F.col("target." + k)
        join_cond = c if join_cond is None else (join_cond & c)

    # Rows to close: existing current rows whose key exists in source with different hash
    to_close = (
        source_with_hash.alias("source")
        .join(
            current_df.alias("target"),
            join_cond,
            "inner",
        )
        .filter(F.col("source._data_hash") != F.col("target._data_hash"))
        .select(F.col("target.*"))
        .drop("_data_hash")
        .withColumn("valid_to", F.current_timestamp())
        .withColumn("is_current", F.lit(0).cast("int"))
    )

    # New rows from source: key not in current target (left_anti)
    new_rows = (
        source_with_hash.alias("source")
        .join(
            current_df.select(key_columns).alias("target"),
            join_cond,
            "left_anti",
        )
        .drop("_data_hash")
        .withColumn("valid_from", F.current_timestamp())
        .withColumn("valid_to", F.lit(None).cast("timestamp"))
        .withColumn("is_current", F.lit(1).cast("int"))
    )

    # Updated rows from source: same key, different hash (insert new version)
    updated_rows = (
        source_with_hash.alias("source")
        .join(
            current_df.alias("target"),
            join_cond,
            "inner",
        )
        .filter(F.col("source._data_hash") != F.col("target._data_hash"))
        .select([F.col("source." + c).alias(c) for c in source_df.columns])
        .drop("_data_hash")
        .withColumn("valid_from", F.current_timestamp())
        .withColumn("valid_to", F.lit(None).cast("timestamp"))
        .withColumn("is_current", F.lit(1).cast("int"))
    )

    # Unchanged current rows: same key and same hash (keep as-is)
    unchanged_current = (
        source_with_hash.alias("source")
        .join(
            current_df.alias("target"),
            join_cond,
            "inner",
        )
        .filter(F.col("source._data_hash") == F.col("target._data_hash"))
        .select([F.col("target." + c).alias(c) for c in existing_df.columns])
        .drop("_data_hash")
    )

    # Build result: history + closed + unchanged current + new + updated
    result = (
        history_df.unionByName(to_close, allowMissingColumns=True)
        .unionByName(unchanged_current, allowMissingColumns=True)
        .unionByName(new_rows, allowMissingColumns=True)
        .unionByName(updated_rows, allowMissingColumns=True)
    )
    # Align schema with target for overwrite
    result = result.select(existing_df.columns)

    result.write.format("delta").mode("overwrite").saveAsTable(target_table)


def add_scd2_columns(df: DataFrame) -> DataFrame:
    """
    Add SCD Type 2 columns to a DataFrame (valid_from, valid_to, is_current).

    Use for initial load or when source does not have them.
    New rows get valid_from=now, valid_to=null, is_current=1.
    """
    return (
        df.withColumn("valid_from", F.current_timestamp())
        .withColumn("valid_to", F.lit(None).cast("timestamp"))
        .withColumn("is_current", F.lit(1).cast("int"))
    )
