export const SITE_URL = "https://terpplan.com";

// Cloudflare Web Analytics beacon token (Cloudflare dashboard → Web Analytics → Add a site → manual JS snippet).
// Leave empty to turn analytics off. It counts visits without cookies or personal data.
export const CLOUDFLARE_ANALYTICS_TOKEN = "0633bc6635ae470f9bfda4e03fec7558";

export const analyticsEnabled = CLOUDFLARE_ANALYTICS_TOKEN.length > 0;
