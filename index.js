import { Hono } from 'hono';
import { adminDb } from './configs/firebase';
import { redisClient, connectRedis, safeRedisOperation } from './configs/redis';
import generateSignatureRsa from './utils/generateSignatureRsa';
const app = new Hono();

// Initialize Redis connection
await connectRedis();

// Environment variables - these should be set in your deployment environment
const API_KEY = process.env.THREE_COMMAS_API_KEY_CREATE_SMART_TRADE;
const PRIVATE_KEY = process.env.THREE_COMMAS_RSA_PRIVATE_KEY_SMART_TRADE;
const baseUrl = "https://api.3commas.io";

const trackApiUsage = async () => {
  const now = Math.floor(Date.now() / 60000); // current minute timestamp
  const key = `3CommasApi:usage:${now}`;

  const count = await redisClient.incr(key);

  // Keep each bucket for ~61 minutes, then auto-delete
  await redisClient.expire(key, 61 * 60);

  return count;
};

async function checkRedisAndCheck3Commas () {
  try {
    const q = adminDb
      .collection("3commas_logs")
      .where("status_type", "==", "waiting_targets");
    const snapshot1 = await q.count().get();
    const waitingTargetsCount = snapshot1.data().count;

    const q2 = adminDb.collection("3commas_logs")
      .where("status_type", "==", "waiting_position");
    const snapshot2 = await q2.count().get();
    const waitingPositionsCount = snapshot2.data().count;
    const totalActiveTradesDatabase = waitingTargetsCount + waitingPositionsCount;
    console.log(totalActiveTradesDatabase,'totalActiveTradesDatabase')

    // count total pages if one page is of maximum 100 entries
    const totalPages = Math.ceil(totalActiveTradesDatabase / 100);
    // return {totalPages}

    // 1. request active trades from mock3commas =>> in production, get real data from 3commas with pagination
    // get latest 100 all status from 3commas
    const activeTrades3Commas = [];
    const xxx = new Array(totalPages).fill('').map(async (_, i) => {
      // console.log(`processing page ${i + 1} of ${totalPages}`);
      const queryParams =
        "/public/api" +
        `/v2/smart_trades?per_page=100&page=${i + 1}&status=active&order_by=updated_at`;
      const finalUrl = baseUrl + queryParams;
      const signatureMessage = queryParams;
      const signature = generateSignatureRsa(PRIVATE_KEY, signatureMessage);
      const config = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          APIKEY: API_KEY,
          Signature: signature
        }
      };
      // ==================================== TRACK API USAGE ================================
      trackApiUsage().then((currentCount) => {  }).catch((e) => console.error("Error tracking API usage:", e));
      // ==================================== TRACK API USAGE ================================
      const response = await fetch(finalUrl, config);
      const data = await response.json();
      const error = data?.error;
      const error_attributes = data?.error_attributes;
      const error_description = data?.error_description;
      if (error) {
        console.log(error, "error on index ", i + 1);
        console.log(error_attributes, "error_attributes on index ", i + 1);
        console.log(error_description, "error_description on index ", i + 1);
      }
      data.forEach((trade) => activeTrades3Commas.push(trade));
    });
    // ======================================== WAIT FOR ALL FETCHES TO COMPLETE ========================================
    await Promise.allSettled(xxx);
    // ======================================== FETCHES DONE ========================================

    console.log(`Start processing, ${activeTrades3Commas.length} trades data from 3Commas`);
    const promises1 = activeTrades3Commas.map(async (x) => {
      const smart_trade_id = x.id;
      // console.log(`processing id ${smart_trade_id} inside promises1 activeTrades3Commas`);
      // get redis, unstrigify data, and update
      const redisData = await redisClient.get(`smart_trade_id:${smart_trade_id}`);
      let parsedData = JSON.parse(redisData);
      if (!redisData) {
        // get from firebase
        const arr = [];
        const q = await adminDb.collection('3commas_logs').where('smart_trade_id', '==', String(x.id)).get();
        q.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
        if (arr.length === 0) return console.log(`not found on firebase smart_trade_id ${smart_trade_id}`);
        const kuda = arr.find((y) => y.requestBody.action === 'CREATE');
        parsedData = kuda;
        if (!kuda){
          console.log(`kuda not found for smart_trade_id:${smart_trade_id}`);
          return x;
        }
      }
      const updateData = {
        ...parsedData,
        status : x.status || null,
        status_type : x.status.type || null,
        profit: x.profit || null
      }

      redisClient.set(`smart_trade_id:${smart_trade_id}`, JSON.stringify(updateData))
      return parsedData
    });
    // const resultpromises1 = await Promise.allSettled(promises1);

    // create set from activeTrades3Commas
    const activeTradesSet = new Set(
      activeTrades3Commas.map((trade) => `smart_trade_id:${trade.id}`)
    );

    // 2. get all smart_trade_id keys from REDIS using SCAN command
    const smartTradeKeys = await scanSmartTradeKeys();
    console.log(`Found first 10 smartTradeKeys out of ${smartTradeKeys.length}:`, smartTradeKeys.slice(0, 10));
    // create set from smartTradeKeys REDIS
    const smartTradeKeysSet = new Set(smartTradeKeys);

    // create distinction
    const tradesDataExistOnRedisButNotOn3Commas = smartTradeKeys.filter((key) => !activeTradesSet.has(key));
    const tradesDataExistOn3CommasButNotOnRedis = activeTrades3Commas.filter((trade) => !smartTradeKeysSet.has(`smart_trade_id:${trade.id}`));

    const promises2 = tradesDataExistOnRedisButNotOn3Commas.map(async (x) => {
      const dataFindOn3comas = await findOn3Commas(x); // x = smart_trade_id:${x}
      // console.log(dataFindOn3comas, 'dataFindOn3comas');
      if (dataFindOn3comas.error) {
        console.log(`dataFindOn3comas not found for ${x}, ERROR:${dataFindOn3comas.error}`);
        return;
      }
      if (
        dataFindOn3comas.status?.type === 'finished' ||
        dataFindOn3comas.status?.type === 'failed' ||
        dataFindOn3comas.status?.type === 'cancelled' ||
        dataFindOn3comas.status?.type === 'panic_sold' ||
        dataFindOn3comas.status?.type === 'stop_loss_finished'
      ) {
        // delete record from REDIS
        console.log(`updating dataFindOn3comas: ${dataFindOn3comas?.id} to REDIS`);
        console.log(`deleting ${x} since status is ${dataFindOn3comas.status.type}`);
        redisClient.del(x);
      }

      // TO DO : update to firebse firestore the corresponding trade data
      console.log(`updating dataFindOn3comas: ${dataFindOn3comas?.id} to FIREBSE FIRESTORE`);
      // update status to firebase firestore
      const arr = [];
      const q = await adminDb.collection('3commas_logs').where('smart_trade_id', '==', String(x.split(':')[1])).get();
      q.forEach((doc) => {
        arr.push({ id: doc.id, ...doc.data() });
      });
      arr.map(async (doc) => {
        await adminDb
          .collection('3commas_logs')
          .doc(doc.id)
          .update({
            status_type: dataFindOn3comas.status.type,
            profit: dataFindOn3comas?.profit || null,
            status: dataFindOn3comas?.status || null,
            profit_usd: dataFindOn3comas?.profit?.usd ? parseFloat(dataFindOn3comas?.profit?.usd) : null,
            volume_usd: dataFindOn3comas?.position?.total?.value ? parseFloat(dataFindOn3comas?.position?.total?.value) : null
          });
      });
    });

    const promises3 = tradesDataExistOn3CommasButNotOnRedis.map(async (x) => {
      // x = `smart_trade_id:((xxxx))`
      // TO DO : check if the non-existent trade exist on firestore
      // update trade data to both fireabase and REDIS
      try {
        const arr = [];
        const q = await adminDb.collection('3commas_logs').where('smart_trade_id', '==', String(x.split(':')[1])).get();
        q.forEach((doc) => {
          arr.push({ id: doc.id, ...doc.data() });
        });
        if (arr.length === 0) {
          throw new Error( `record on firestore not found for:::::::: ${x}`);
        } else {
          let createRecordOnFirestore = arr.find((y) => y.requestBody?.action === 'CREATE');
          if (!createRecordOnFirestore) {createRecordOnFirestore = arr[0];}
          await safeRedisOperation(() => redisClient.set(x, JSON.stringify(createRecordOnFirestore)));
        }
      } catch(e) {
        return e
      }
    });
    const allPromises = await Promise.allSettled([...promises1, ...promises2, ...promises3]);

    return {
      tradesDataExistOn3CommasButNotOnRedis,
      tradesDataExistOnRedisButNotOn3Commas,
      resultPromises: allPromises.map((x) => x.status === 'fulfilled' ? x.value : x.reason),
    };
  } catch (error) {
    console.error("error checkRedisAndCheck3Commas", error);
    throw error;
  }
}

async function scanSmartTradeKeys (pattern = "smart_trade_id:*") {
  let cursor = "0";
  let keys = [];

  do {
    const result = await safeRedisOperation(() => redisClient.scan(cursor, {
      MATCH: pattern,
      COUNT: 100
    }), []);

    cursor = result.cursor; // new cursor
    keys = keys.concat(result.keys); // append found keys

  } while (cursor !== "0");

  return keys;
}

async function findOn3Commas (smartTradeId) {
  const id = smartTradeId.split(':')[1];
  console.log(`finding on 3COMMAS smart trade id ${id}`);

  // return null
  const queryParams = `/public/api/v2/smart_trades/${id}`;
  const finalUrl = baseUrl + queryParams;
  const signatureMessage = queryParams;
  const signature = generateSignatureRsa(PRIVATE_KEY, signatureMessage);
  const config = {
    method: "GET",
    headers: {
      'Content-Type': 'application/json',
      APIKEY: API_KEY,
      Signature: signature
    }
  };
  const response = await fetch(finalUrl, config);
  const data = await response.json();
  // ==================================== TRACK API USAGE ================================
  trackApiUsage().then((currentCount) => {  }).catch((e) => console.error("Error tracking API usage:", e));
  return data;
}

app.get('/cron-smart-trade-checker', async (c) => {
  try {
    const result = await checkRedisAndCheck3Commas();
    return c.json({ message: 'OK', ...result }, 200);
  } catch (e) {
    console.error('Error in cron-smart-trade-checker:', e);
    return c.json({ error: e.message }, 500);
  }
});

app.get('/', (c) => {
  return c.json({ message: 'Byscript Hono Checker is running!!' });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'Application is running'
  });
});

app.get('/redis', async (c) => {
  try {
    await redisClient.flushAll();
    return c.json({ message: 'redis FLUSHED' });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});
app.get('/firebase', async (c) => {
  try {
    const doc = await adminDb.collection('3commas_logs').doc('002KYBpXyO0jfDVAeb1p').get();
    const data = { id: doc.id, ...doc.data() };
    return c.json({ data, message: 'firebase is running' });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

export default {
  port: process.env.PORT || 4041,
  fetch: app.fetch,
  idleTimeout: 254, // seconds
  requestTimeout: 254, // seconds
};

export { checkRedisAndCheck3Commas };
