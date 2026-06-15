const testWebhooksAndVerify = async () => {
  const url = 'https://atlas-admin-dashboard-backend.onrender.com/api';
  const webhookToken = 'ic8eojqK1Vxl9ZzsM5Mg5yU9Zo1teJbGpzAD';

  // 1. Post a new qualified lead via webhook
  const uniqueId = Date.now().toString();
  const testEmail = `lead-${uniqueId}@example.com`;
  console.log(`\nPosting qualified lead with email: ${testEmail}...`);
  const res1 = await fetch(`${url}/webhooks/leads/qualified`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${webhookToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: `Webhook Test ${uniqueId}`,
      email: testEmail,
      service: 'Web Development'
    })
  });
  console.log('Webhook POST Status:', res1.status);

  // 2. Login to get cookie
  console.log('\nLogging in as admin...');
  const loginRes = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'admin1@atlas-africa.com.ng',
      password: 'nimda@salta'
    })
  });
  console.log('Login Status:', loginRes.status);
  
  const setCookieHeader = loginRes.headers.get('set-cookie');
  if (!setCookieHeader) {
      console.log("No cookie found");
      return;
  }
  
  // Basic cookie parse
  const cookie = setCookieHeader.split(';')[0];
  console.log('Received cookie');

  // 3. Check leads
  console.log('\nFetching leads to verify...');
  const leadsRes = await fetch(`${url}/leads?search=${testEmail}`, {
    method: 'GET',
    headers: {
      'Cookie': cookie
    }
  });
  
  console.log('Leads GET Status:', leadsRes.status);
  const leadsData = await leadsRes.json();
  const found = leadsData.data.leads.find(l => l.email === testEmail);
  if (found) {
    console.log('✅ Lead successfully found in DB!');
    console.log(found);
  } else {
    console.log('❌ Lead NOT found in DB!');
  }
};

testWebhooksAndVerify().catch(console.error);
