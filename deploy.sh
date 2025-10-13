#!/bin/bash

# Job Posting Extractor Worker Deployment Script

set -e

echo "🚀 Deploying Job Posting Extractor Worker..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Please log in to Cloudflare first:"
    echo "wrangler login"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🗄️ Setting up D1 database..."
# Create D1 database if it doesn't exist
DB_NAME="job-extractor-db"
if ! wrangler d1 list | grep -q "$DB_NAME"; then
    echo "Creating D1 database: $DB_NAME"
    wrangler d1 create "$DB_NAME"
    echo "⚠️  Please update wrangler.toml with the database_id from above"
    echo "Press any key to continue after updating wrangler.toml..."
    read -n 1 -s
fi

# Run migrations
echo "Running database migrations..."
wrangler d1 execute "$DB_NAME" --file=./migrations/0001_initial_schema.sql
wrangler d1 execute "$DB_NAME" --file=./migrations/0002_linkedin_config.sql

echo "🪣 Setting up R2 bucket..."
# Create R2 bucket if it doesn't exist
BUCKET_NAME="job-extractor-assets"
if ! wrangler r2 bucket list | grep -q "$BUCKET_NAME"; then
    echo "Creating R2 bucket: $BUCKET_NAME"
    wrangler r2 bucket create "$BUCKET_NAME"
fi

echo "🔐 Setting up secrets..."
echo "You'll need to set up authentication secrets for the sites you want to scrape:"
echo ""
echo "For LinkedIn:"
echo "wrangler secret put LINKEDIN_USERNAME"
echo "wrangler secret put LINKEDIN_PASSWORD"
echo ""
echo "For Indeed:"
echo "wrangler secret put INDEED_USERNAME"
echo "wrangler secret put INDEED_PASSWORD"
echo ""
echo "For Glassdoor:"
echo "wrangler secret put GLASSDOOR_USERNAME"
echo "wrangler secret put GLASSDOOR_PASSWORD"
echo ""
echo "Would you like to set these up now? (y/n)"
read -r setup_secrets

if [[ $setup_secrets =~ ^[Yy]$ ]]; then
    echo "Setting up LinkedIn credentials..."
    wrangler secret put LINKEDIN_USERNAME
    wrangler secret put LINKEDIN_PASSWORD
    
    echo "Setting up Indeed credentials..."
    wrangler secret put INDEED_USERNAME
    wrangler secret put INDEED_PASSWORD
    
    echo "Setting up Glassdoor credentials..."
    wrangler secret put GLASSDOOR_USERNAME
    wrangler secret put GLASSDOOR_PASSWORD
fi

echo "🏗️ Building and deploying worker..."
wrangler deploy

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your worker is now available at:"
wrangler whoami | grep "Account ID" | awk '{print "https://job-extractor-worker." $3 ".workers.dev"}'
echo ""
echo "📚 API Endpoints:"
echo "  POST /extract-job - Extract job data from URL (with auth)"
echo "  POST /extract-text - Extract job data from text"
echo "  GET /health - Health check"
echo ""
echo "📖 See README.md for usage examples and API documentation."
echo ""
echo "🧪 Test your deployment:"
echo 'curl -X POST https://your-worker.workers.dev/extract-text \'
echo '  -H "Content-Type: text/plain" \'
echo '  -d "Software Engineer at TechCorp, San Francisco, $120k-180k"'
