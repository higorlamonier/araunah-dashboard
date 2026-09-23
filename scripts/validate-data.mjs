import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_TOP_LEVEL = ['client', 'period', 'freshness', 'totals', 'daily', 'insights'];
const REQUIRED_TOTALS = ['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'sessions'];
const REQUIRED_DAILY = ['date', 'source', 'campaign', 'spend', 'impressions', 'clicks', 'conversions', 'revenue'];
const FORBIDDEN_SECRETS = ['windsor_api_key', 'api_key=', 'netlify_auth_token', 'github_token', 'openai_api_key'];

function fail(message) {
  console.error(`DATA_VALIDATION_ERROR: ${message}`);
  process.exit(1);
}

function validate(filePath) {
  const absolutePath = resolve(filePath);
  let content;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    fail(`Could not read file ${absolutePath}: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    fail(`Invalid JSON in ${absolutePath}: ${err.message}`);
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in data)) {
      fail(`missing top-level key: ${key}`);
    }
  }

  for (const key of REQUIRED_TOTALS) {
    if (!(key in data.totals)) {
      fail(`missing totals key: ${key}`);
    }
  }

  if (!Array.isArray(data.daily) || data.daily.length === 0) {
    fail('daily rows cannot be empty');
  }

  data.daily.forEach((row, index) => {
    for (const key of REQUIRED_DAILY) {
      if (!(key in row)) {
        fail(`daily row ${index} missing key: ${key}`);
      }
    }
    for (const numeric of ['spend', 'impressions', 'clicks', 'conversions', 'revenue']) {
      if (typeof row[numeric] !== 'number' || Number.isNaN(row[numeric])) {
        fail(`daily row ${index} has non-numeric ${numeric}`);
      }
    }
  });

  const lowerContent = content.toLowerCase();
  for (const needle of FORBIDDEN_SECRETS) {
    if (lowerContent.includes(needle)) {
      fail(`possible secret marker found: ${needle}`);
    }
  }

  console.log(`OK: ${filePath} contains ${data.daily.length} daily rows and passed schema/secret checks`);
}

const targetFile = process.argv[2] || 'data/demo/latest.json';
validate(targetFile);
