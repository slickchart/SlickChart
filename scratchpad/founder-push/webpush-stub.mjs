export default {
  setVapidDetails() {},
  async sendNotification(sub, body) { (globalThis.__webSends ||= []).push({ sub, body: JSON.parse(body) }); if (sub.endpoint.includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } }
};
