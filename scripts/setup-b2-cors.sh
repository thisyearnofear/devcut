#!/usr/bin/env bash
# Apply CORS rules to a Backblaze B2 bucket (S3-compatible API) so the
# DevCut canvas can play durable <video> / fetch manifests from the browser.
#
# Prerequisites: AWS CLI v2 configured with B2 keys, e.g.:
#   export AWS_ACCESS_KEY_ID="$B2_KEY_ID"
#   export AWS_SECRET_ACCESS_KEY="$B2_APP_KEY"
#   export AWS_DEFAULT_REGION="${B2_REGION:-us-west-004}"
#
# Usage:
#   bash scripts/setup-b2-cors.sh
#   B2_BUCKET=my-bucket bash scripts/setup-b2-cors.sh
set -euo pipefail

BUCKET="${B2_BUCKET:?Set B2_BUCKET}"
REGION="${B2_REGION:-us-west-004}"
ENDPOINT="https://s3.${REGION}.backblazeb2.com"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cat >"$TMP" <<'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://director.thisyearnofear.com",
        "http://localhost:3010",
        "http://localhost:3000",
        "http://127.0.0.1:3010"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-meta-*", "Content-Type", "Content-Length"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

echo "Applying CORS to s3://${BUCKET} via ${ENDPOINT}"
aws s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --cors-configuration "file://${TMP}" \
  --endpoint-url "$ENDPOINT"

echo "Current CORS:"
aws s3api get-bucket-cors --bucket "$BUCKET" --endpoint-url "$ENDPOINT"
echo "OK"
