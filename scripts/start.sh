#!/bin/bash

echo "🚀 Starting Blockscout Explorer for Geth PoA Clique..."

# Generate secret key if not exists
if grep -q "generate_a_64" envs/backend.env; then
    echo "📝 Generating secret key..."
    SECRET_KEY=$(openssl rand -hex 64)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/generate_a_64_character_hex_secret_key_using_openssl_rand_hex_64_command_now/$SECRET_KEY/" envs/backend.env
    else
        sed -i "s/generate_a_64_character_hex_secret_key_using_openssl_rand_hex_64_command_now/$SECRET_KEY/" envs/backend.env
    fi
    echo "✅ Secret key generated"
fi

# Start services
echo "🐳 Starting Docker containers..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 30

# Check status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🌐 Blockscout Explorer URLs:"
echo "   Frontend:  http://localhost:3000"
echo "   API:       http://localhost:4000/api/v2"
echo "   Proxy:     http://localhost:80"
echo ""
echo "📋 Useful commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Backend logs:  docker-compose logs -f backend"
echo "   Stop:          docker-compose down"
echo "   Reset:         docker-compose down -v"