import http from 'http';

const PB_URL = 'http://127.0.0.1:8090';

async function request(method, pathname, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(pathname, PB_URL);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers,
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, data: {} }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    const authRes = await request('POST', '/api/collections/_superusers/auth-with-password', {
        identity: 'admin@example.com',
        password: 'password123456',
    });
    const token = authRes.data.token;

    // Get student_results collection
    const collRes = await request('GET', '/api/collections/student_results', null, token);
    const coll = collRes.data;

    // Check if is_exempt exists
    if (!coll.fields.some(f => f.name === 'is_exempt')) {
        coll.fields.push({
            name: 'is_exempt',
            type: 'bool',
            required: false,
        });

        const updateRes = await request('PATCH', '/api/collections/student_results', coll, token);
        console.log("Updated collection:", updateRes.status);
    } else {
        console.log("is_exempt already exists");
    }
}

main();
