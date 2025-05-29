#!/bin/bash

# Set ports
BACKEND_PORT=5000
FRONTEND_PORT=5173

# Start backend
echo "Starting ASP.NET backend on port $BACKEND_PORT..."
PID_ON_PORT=$(lsof -t -i:$BACKEND_PORT)
if [ -n "$PID_ON_PORT" ]; then
    echo "Found existing process $PID_ON_PORT on port $BACKEND_PORT. Killing it..."
    kill -9 $PID_ON_PORT
    # Add a small delay to allow the port to be released
    sleep 1
else
    echo "No existing process found on port $BACKEND_PORT."
fi
cd backend
dotnet build
if [ $? -ne 0 ]; then
    echo "Backend build failed. Please check the errors above."
    exit 1
fi
dotnet run --urls=http://localhost:$BACKEND_PORT &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 5

# Start frontend (static web server)
echo "Starting static server for frontend on port $FRONTEND_PORT..."
# Install serve if not present
if ! command -v npx >/dev/null 2>&1; then
    echo "npx not found. Please install Node.js and npm."
    exit 1
fi
npx serve -s . -l $FRONTEND_PORT &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
sleep 2

# Open frontend in default browser
echo "Opening http://localhost:$FRONTEND_PORT in your default browser..."
if which xdg-open > /dev/null; then
  xdg-open "http://localhost:$FRONTEND_PORT"
elif which open > /dev/null; then
  open "http://localhost:$FRONTEND_PORT"
elif which start > /dev/null; then
  start "http://localhost:$FRONTEND_PORT"
else
  echo "Please open http://localhost:$FRONTEND_PORT manually."
fi

# Optionally, wait for user to Ctrl+C to kill servers
echo "Press Ctrl+C to stop servers."
wait $BACKEND_PID $FRONTEND_PID