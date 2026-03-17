# ベース: Python 3.11 の軽量イメージ
FROM python:3.11-slim

# コンテナ内の作業ディレクトリ（ここにコードを置く）
WORKDIR /app

# 先に requirements だけコピーして pip install（レイヤーキャッシュのため）
COPY requirements.txt .

# 依存をインストール
RUN pip install --no-cache-dir -r requirements.txt

# Bot で使うスクリプトをコピー（bot.py が fetch_guild_info を import するので両方必要）
COPY scripts/01_setup/bot.py scripts/01_setup/
COPY scripts/01_setup/fetch_guild_info.py scripts/01_setup/

# コンテナ起動時に実行するコマンド
CMD ["python", "scripts/01_setup/bot.py"]