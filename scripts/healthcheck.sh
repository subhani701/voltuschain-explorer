#!/bin/bash

echo "🔍 Blockscout Health Check"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check Geth RPC
echo -n "Geth RPC:         "
if curl -s -X POST -H "Content-Type: application/json" \
   --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
   http://localhost:8545 | grep -q "result"; then
    echo -e "${GREEN}✅ OK${NC}"
    BLOCK=$(curl -s -X POST -H "Content-Type: application/json" \
       --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       http://localhost:8545 | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    echo "                  Block: $BLOCK"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check Database
echo -n "PostgreSQL:       "
if docker exec bs-db pg_isready -U blockscout -q; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check Redis
echo -n "Redis:            "
if docker exec bs-redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check Backend
echo -n "Backend API:      "
if curl -s http://localhost:4001/api/v2/stats | grep -q "total_blocks"; then
    echo -e "${GREEN}✅ OK${NC}"
    STATS=$(curl -s http://localhost:4001/api/v2/stats)
    TOTAL_BLOCKS=$(echo $STATS | grep -o '"total_blocks":"[^"]*"' | cut -d'"' -f4)
    TOTAL_TXS=$(echo $STATS | grep -o '"total_transactions":"[^"]*"' | cut -d'"' -f4)
    echo "                  Indexed Blocks: $TOTAL_BLOCKS"
    echo "                  Indexed TXs: $TOTAL_TXS"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check Frontend
echo -n "Frontend:         "
if curl -s http://localhost:3001 | grep -q "html"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check Verifier
echo -n "Contract Verifier: "
if curl -s http://localhost:8151/api/v2/verifier/solidity/versions | grep -q "compilerVersions"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check Stats
echo -n "Stats Service:    "
if curl -s http://localhost:8155/api/v1/counters | grep -q -E "(totalBlocks|error)"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

echo ""
echo "=========================="
echo "All containers:"
docker-compose ps