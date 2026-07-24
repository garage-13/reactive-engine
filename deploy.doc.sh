#!/bin/bash

source ./_aux.read-env.sh

# PROD_TARGET_PATH_BUILD_DIR=$(read_env PROD_TARGET_PATH_BUILD_DIR .env.prod."$1")
PROD_TARGET_PATH_BUILD_DIR=$(read_env PROD_TARGET_PATH_BUILD_DIR .env.production.local)

yarn docs:build

echo '-- DOC DEPLOY STARTED 🛫' &&

rsync -av --delete docs/.vitepress/dist/ $PROD_TARGET_PATH_BUILD_DIR &&

echo '-- DOC DEPLOY COMPLETED 🛬'
