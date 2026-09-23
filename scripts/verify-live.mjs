import assert from 'node:assert/strict';

console.log('=== STARTING EXHAUSTIVE LIVE VERIFICATION ON META.ARAUNAH.COM ===\n');

// 1. VERIFY SPA HTML & BUNDLED ASSETS
console.log('1. Checking Production SPA Assets...');
const indexRes = await fetch('https://meta.araunah.com/');
assert.equal(indexRes.status, 200, 'Index HTML must return 200');
const indexHtml = await indexRes.text();
assert.ok(indexHtml.includes('<div id="root">'), 'Root div must exist in HTML');
console.log('  ✓ Index HTML returned 200 OK and valid root mount point.');

// Extract asset filenames from index.html
const jsMatch = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/);
const cssMatch = indexHtml.match(/href="(\/assets\/[^"]+\.css)"/);
assert.ok(jsMatch, 'JS bundle must be referenced in index.html');
assert.ok(cssMatch, 'CSS bundle must be referenced in index.html');
console.log('  ✓ JS Bundle:', jsMatch[1]);
console.log('  ✓ CSS Bundle:', cssMatch[1]);

// Verify CSS bundle contains new Leads CRM classes, Instagram visual cards, and Meta Ads didactic classes
const cssRes = await fetch('https://meta.araunah.com' + cssMatch[1]);
assert.equal(cssRes.status, 200, 'CSS bundle must return 200');
const cssContent = await cssRes.text();
assert.ok(cssContent.includes('.leads-kpi-grid'), 'CSS must contain .leads-kpi-grid');
assert.ok(cssContent.includes('.leads-filters-bar'), 'CSS must contain .leads-filters-bar');
assert.ok(cssContent.includes('.leads-table'), 'CSS must contain .leads-table');
assert.ok(cssContent.includes('.bar-hover-tooltip'), 'CSS must contain .bar-hover-tooltip');
assert.ok(cssContent.includes('.monitor-embedded-toolbar'), 'CSS must contain .monitor-embedded-toolbar');
assert.ok(cssContent.includes('.posts-visual-grid'), 'CSS must contain .posts-visual-grid');
assert.ok(cssContent.includes('.ig-media-card'), 'CSS must contain .ig-media-card');
assert.ok(cssContent.includes('.leads-funnel-card'), 'CSS must contain .leads-funnel-card');
assert.ok(cssContent.includes('.n8n-pipeline-diagram'), 'CSS must contain .n8n-pipeline-diagram');
assert.ok(cssContent.includes('.meta-didactic-card'), 'CSS must contain .meta-didactic-card');
assert.ok(cssContent.includes('.leads-pagination-bar'), 'CSS must contain .leads-pagination-bar');
assert.ok(cssContent.includes('.account-card.is-selected'), 'CSS must contain .account-card.is-selected');
assert.ok(cssContent.includes('.property-card.is-selected'), 'CSS must contain .property-card.is-selected');
console.log('  ✓ CSS Bundle contains all new styles: .posts-visual-grid, .ig-media-card, .leads-funnel-card, .n8n-pipeline-diagram, .meta-didactic-card, .leads-pagination-bar, .account-card.is-selected, .property-card.is-selected.');

// Verify JS bundle contains the 3 Instagram accounts
const jsRes = await fetch('https://meta.araunah.com' + jsMatch[1]);
assert.equal(jsRes.status, 200, 'JS bundle must return 200');
const jsContent = await jsRes.text();
assert.ok(jsContent.includes('araunah.agro'), 'JS bundle must contain @araunah.agro');
assert.ok(jsContent.includes('araunah.agua'), 'JS bundle must contain @araunah.agua');
assert.ok(jsContent.includes('araunah.florestas'), 'JS bundle must contain @araunah.florestas');
console.log('  ✓ JS Bundle contains @araunah.agro, @araunah.agua, @araunah.florestas.');

// 2. VERIFY CHATBOT MONITOR API (ZERO CONTINGENCY WARNING)
console.log('\n2. Checking Chatbot Monitor API (Latency & Health)...');
const chatRes = await fetch('https://meta.araunah.com/chatbot-api/summary?days=15');
assert.equal(chatRes.status, 200, 'Chatbot API must return 200');
const chatData = await chatRes.json();
assert.equal(chatData.isDegraded, false, 'isDegraded MUST be false (no contingency)');
assert.equal(chatData.workflow?.name, 'CHATBOT-ARAUNAH WHATSAPP');
assert.equal(chatData.workflow?.active, true, 'Workflow must be active');
assert.ok(chatData.totals?.inbound > 0, 'Inbound messages must be > 0');
console.log('  ✓ Chatbot Monitor is NOT degraded: isDegraded = false');
console.log('  ✓ Workflow:', chatData.workflow?.name, '(Active:', chatData.workflow?.active + ')');
console.log('  ✓ Inbound messages:', chatData.totals?.inbound);
console.log('  ✓ Executions analyzed:', chatData.coverage?.executionsInRange);

// 3. VERIFY LEADS CRM API & MATHEMATICAL INTEGRITY (NO 600% BUG)
console.log('\n3. Checking Leads CRM API (Mathematical Consistency)...');
const leadsRes = await fetch('https://meta.araunah.com/leads-api/summary?days=30&internal=1', {
  headers: { 'x-dashboard-view': '1' }
});
assert.equal(leadsRes.status, 200, 'Leads API must return 200');
const leadsData = await leadsRes.json();
assert.ok(leadsData.summary?.uniqueLeads > 0, 'Unique leads must be > 0');
assert.ok(Array.isArray(leadsData.leads), 'Leads must be an array');
assert.equal(leadsData.summary.uniqueLeads, leadsData.leads.length, 'uniqueLeads must match leads.length exactly');
assert.ok(leadsData.summary.inQualification <= leadsData.summary.uniqueLeads, 'inQualification cannot exceed uniqueLeads (no 600% bug)');
console.log('  ✓ Unique leads found:', leadsData.summary?.uniqueLeads);
console.log('  ✓ In qualification (unique leads):', leadsData.summary?.inQualification);
console.log('  ✓ Created in CRM:', leadsData.summary?.created);
console.log('  ✓ Mathematical sanity: inQualification <= uniqueLeads PASSED.');
console.log('  ✓ Sample lead:', leadsData.leads[0]?.name, 'from', leadsData.leads[0]?.city, '(' + leadsData.leads[0]?.occurredAt + ')');

// 4. VERIFY PERIOD SWITCHING (7d, 15d, 30d) DYNAMIC DIFFERENCES
console.log('\n4. Checking Dynamic Period Switching (7d vs 15d vs 30d)...');
const p7Res = await fetch('https://meta.araunah.com/.netlify/functions/dashboard-data?period=7d');
const p15Res = await fetch('https://meta.araunah.com/.netlify/functions/dashboard-data?period=15d');
const p30Res = await fetch('https://meta.araunah.com/.netlify/functions/dashboard-data?period=30d');

assert.equal(p7Res.status, 200);
assert.equal(p15Res.status, 200);
assert.equal(p30Res.status, 200);

const d7 = await p7Res.json();
const d15 = await p15Res.json();
const d30 = await p30Res.json();

console.log('  ✓ Period 7d:  Spend = R$', d7.facebookAds?.totals?.spend, '| Leads =', d7.facebookAds?.totals?.leads, '| Days =', d7.facebookAds?.daily?.length);
console.log('  ✓ Period 15d: Spend = R$', d15.facebookAds?.totals?.spend, '| Leads =', d15.facebookAds?.totals?.leads, '| Days =', d15.facebookAds?.daily?.length);
console.log('  ✓ Period 30d: Spend = R$', d30.facebookAds?.totals?.spend, '| Leads =', d30.facebookAds?.totals?.leads, '| Days =', d30.facebookAds?.daily?.length);

assert.ok(d15.facebookAds?.totals?.spend > d7.facebookAds?.totals?.spend, '15d spend must be greater than 7d spend');
assert.ok(d30.facebookAds?.totals?.spend > d15.facebookAds?.totals?.spend, '30d spend must be greater than 15d spend');
assert.ok(d15.facebookAds?.totals?.leads > d7.facebookAds?.totals?.leads, '15d leads must be greater than 7d leads');
assert.ok(d30.facebookAds?.totals?.leads > d15.facebookAds?.totals?.leads, '30d leads must be greater than 15d leads');
assert.ok(d7.facebookAds?.daily?.length === 7, '7d daily count must be 7');
assert.ok(d15.facebookAds?.daily?.length === 14, '15d daily count must be 14');
assert.ok(d30.facebookAds?.daily?.length === 25, '30d daily count must be 25');

// 5. VERIFY INSTAGRAM RECENT MEDIA (FEED & REELS)
console.log('\n5. Checking Instagram Recent Media & Images...');
const mediaItems = d7.instagramInsights?.recentMedia;
assert.ok(Array.isArray(mediaItems), 'recentMedia must be an array');
assert.ok(mediaItems.length > 0, 'recentMedia must have at least 1 post');
console.log(`  ✓ Found ${mediaItems.length} recent media items in 7d payload.`);
const sample = mediaItems[0];
assert.ok(sample.id, 'Media must have an id');
assert.ok(sample.permalink?.includes('instagram.com'), 'Media must have a valid Instagram permalink');
const hasImage = !!(sample.mediaUrl || sample.thumbnailUrl);
assert.ok(hasImage, 'Media must have either mediaUrl or thumbnailUrl');
console.log(`  ✓ Sample post ID: ${sample.id} (${sample.type}) - URL: ${sample.permalink}`);
console.log(`  ✓ Media image preview source is valid.`);

console.log('\n=== ALL 5 VERIFICATION STAGES PASSED WITH 100% INTEGRITY ===');

