#!/bin/sh
set -eu

required_vars="AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY R2_ACCOUNT_ID R2_BUCKET_NAME R2_PREFIX"
for variable_name in $required_vars; do
  eval "variable_value=\${$variable_name:-}"
  if [ -z "$variable_value" ]; then
    echo "Missing required container variable: $variable_name" >&2
    exit 1
  fi
done

mount_path=/mnt/r2
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
mkdir -p "$mount_path"

/usr/local/bin/tigrisfs --endpoint "$endpoint" -f "$R2_BUCKET_NAME" "$mount_path" &
fuse_pid=$!

mounted=false
attempt=0
while [ "$attempt" -lt 30 ]; do
  if awk -v target="$mount_path" '$2 == target { found = 1 } END { exit found ? 0 : 1 }' /proc/mounts; then
    mounted=true
    break
  fi
  if ! kill -0 "$fuse_pid" 2>/dev/null; then
    echo "R2 FUSE process exited before the mount became ready" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$mounted" != true ]; then
  echo "Timed out waiting for the R2 FUSE mount" >&2
  kill "$fuse_pid" 2>/dev/null || true
  exit 1
fi

data_path="${mount_path}/${R2_PREFIX}/data"
mkdir -p "$data_path"

cd /home/node/app
if [ -e data ] || [ -L data ]; then
  rm -rf data
fi
ln -s "$data_path" data

npm run init

node server.js --listen --dataRoot ./data --configPath ./config/config.yaml &
app_pid=$!

shutdown() {
  kill -TERM "$app_pid" 2>/dev/null || true
  wait "$app_pid" 2>/dev/null || true
  sync || true
  fusermount3 -u "$mount_path" 2>/dev/null || true
  kill "$fuse_pid" 2>/dev/null || true
}

trap shutdown TERM INT
set +e
wait "$app_pid"
status=$?
set -e
sync || true
fusermount3 -u "$mount_path" 2>/dev/null || true
kill "$fuse_pid" 2>/dev/null || true
exit "$status"
