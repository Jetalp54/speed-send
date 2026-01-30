#!/bin/bash
# Test tracking domain API endpoint
echo "Testing tracking domain API..."
curl -s http://localhost:8000/api/v1/tracking-domains/active | jq
