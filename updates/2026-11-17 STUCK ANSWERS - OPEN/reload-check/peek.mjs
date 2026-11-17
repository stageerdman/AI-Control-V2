// node peek.mjs — what the server says: studio asks (pager), atlas open asks, running list.
const get = (p) => fetch(`http://127.0.0.1:3569${p}`).then((r) => r.json());
console.log('pager', JSON.stringify(await get('/asks?unseen=true'), null, 1));
console.log('all asks', JSON.stringify(await get('/asks'), null, 1));
console.log('atlas open', JSON.stringify(await get('/projects/atlas/asks?status=open'), null, 1));
