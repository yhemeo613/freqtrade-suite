# ⚠️ 仅供参考：本文件是 freqtrade 运行基座的参考说明。
# docker-compose.yml 实际使用官方 freqtradeorg/freqtrade 镜像 + 挂载本地源码，
# 本 Dockerfile 不参与构建（如需切换为本地构建统一依赖来源，请同步升级镜像版本）。
FROM python:3.14.10-slim-trixie AS base

# Setup env
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONFAULTHANDLER=1
ENV PATH=/home/ftuser/.local/bin:$PATH
ENV FT_APP_ENV="docker"

# Prepare environment
RUN mkdir /freqtrade \
  && apt-get update \
  && apt-get -y install --no-install-recommends sudo libatlas3-base curl sqlite3 libgomp1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -u 1000 -G sudo -U -m -s /bin/bash ftuser \
  && chown ftuser:ftuser /freqtrade \
  # Allow sudoers
  && echo "ftuser ALL=(ALL) NOPASSWD: /bin/chown" >> /etc/sudoers \
  && pip install --upgrade pip

WORKDIR /freqtrade

# Install dependencies
FROM base AS python-deps
RUN  apt-get update \
  && apt-get -y install --no-install-recommends build-essential libssl-dev git libffi-dev libgfortran5 pkg-config cmake gcc \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --upgrade pip wheel

# Install dependencies
COPY --chown=ftuser:ftuser requirements.txt requirements-hyperopt.txt /freqtrade/
USER ftuser
RUN  pip install --user --no-cache-dir -r requirements-hyperopt.txt

# Copy dependencies to runtime-image
FROM base AS runtime-image

COPY --from=python-deps --chown=ftuser:ftuser /home/ftuser/.local /home/ftuser/.local

USER ftuser
# Install and execute
COPY --chown=ftuser:ftuser . /freqtrade/

RUN pip install -e . --user --no-cache-dir \
  && mkdir /freqtrade/user_data/

ENTRYPOINT ["freqtrade"]
# Default to trade mode
CMD [ "trade" ]
