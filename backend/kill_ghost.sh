#!/bin/bash
echo "🔍 DIAGNOSTIC: Checking Port 8000..."

# Try to find who holds the port
PID=$(fuser 8000/tcp 2>/dev/null)

if [ -z "$PID" ]; then
    echo "✅ Port 8000 maps to: (Free or Docker Proxy)"
else
    echo "⚠️ Port 8000 is held by PID: $PID"
    # Check if it's docker-proxy (which is good) or something else
    NAME=$(ps -p $PID -o comm=)
    echo "Process Name: $NAME"
    
    if [[ "$NAME" == *"docker-proxy"* ]]; then
        echo "✅ It is docker-proxy. This is usually correct."
    else
        echo "❌ It is NOT docker-proxy. It is a ZOMBIE!"
        echo "🔪 Killing PID $PID..."
        kill -9 $PID
        echo "✅ Killed."
    fi
fi

echo "🔄 Restarting Backend Container to reclaim port..."
docker compose restart backend

echo "⏳ Waiting 5 seconds..."
sleep 5

echo "🧪 TEST: Curling http://localhost:8000/health ..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health)

echo "Response Code: $RESPONSE"

if [ "$RESPONSE" == "200" ]; then
    echo "🎉 SUCCESS: Backend is reachable!"
else
    echo "❌ FAILURE: Backend is still unreachable (Code: $RESPONSE)"
    echo "Logs from backend:"
    docker compose logs backend --tail 20
fi
