import { Hono } from 'hono';
import { adminDb } from './configs/firebase';
import { redisClient } from './configs/redis';
import generateSignatureRsa from './utils/generateSignatureRsa';
const app = new Hono();

// Environment variables - these should be set in your deployment environment
const API_KEY = process.env.THREE_COMMAS_API_KEY_CREATE_SMART_TRADE;
const PRIVATE_KEY = process.env.THREE_COMMAS_RSA_PRIVATE_KEY_SMART_TRADE;
const baseUrl = "https://api.3commas.io";

const trackApiUsage = async () => {
  console.log(`[PLACEHOLDER] trackApiUsage()`);
  return 0;
};

async function checkRedisAndCheck3Commas () {
  try {
    const q = adminDb
      .collection("3commas_logs")
      .where("status_type", "==", "waiting_targets");
    const snapshot1 = await q.count().get();
    const waitingTargetsCount = snapshot1.data().count;
    console.log("number of waiting targets::", waitingTargetsCount);

    const q2 = adminDb.collection("3commas_logs")
      .where("status_type", "==", "waiting_position");
    const snapshot2 = await q2.count().get();
    const waitingPositionsCount = snapshot2.data().count;
    const totalActiveTradesDatabase = waitingTargetsCount + waitingPositionsCount;

    // count total pages if one page is of maximum 100 entries
    const totalPages = Math.ceil(totalActiveTradesDatabase / 100);

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
      trackApiUsage().then((currentCount) => { console.log("API call count this minute:", currentCount); }).catch((e) => console.error("Error tracking API usage:", e));
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
      // get redis, unstrigify data, and update
      const redisData = await redisClient.get(`smart_trade_id:${smart_trade_id}`);
      const parsedData = JSON.parse(redisData);
      const updatedData = { ...parsedData, status: x.status || null, status_type: x.status.type || null, profit: x.profit || null };
      await redisClient.set(`smart_trade_id:${smart_trade_id}`, JSON.stringify(updatedData));
    });
    await Promise.allSettled(promises1);

    // create set from activeTrades3Commas
    const activeTradesSet = new Set(
      activeTrades3Commas.map((trade) => `smart_trade_id:${trade.id}`)
    );

    // 2. get all smart_trade_id keys from REDIS using SCAN command
    const smartTradeKeys = await scanSmartTradeKeys();
    console.log("Found smartTradeKeys:", smartTradeKeys);
    // create set from smartTradeKeys REDIS
    const smartTradeKeysSet = new Set(smartTradeKeys);

    // create distinction
    const tradesDataExistOnRedisButNotOn3Commas = smartTradeKeys.filter((key) => !activeTradesSet.has(key));
    const tradesDataExistOn3CommasButNotOnRedis = activeTrades3Commas.filter((trade) => !smartTradeKeysSet.has(`smart_trade_id:${trade.id}`));

    const promises = tradesDataExistOnRedisButNotOn3Commas.map(async (x) => {
      const dataFindOn3comas = await findOn3Commas(x); // x = smart_trade_id:${x}
      console.log(dataFindOn3comas, 'dataFindOn3comas');
      if (!dataFindOn3comas) {
        console.log(`dataFindOn3comas not found for ${x}`);
        return;
      }

      // TO DO : update to firebse firestore the corresponding trade data
      console.log(`updating dataFindOn3comas: ${dataFindOn3comas?.id} to REDIS`);
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
            status: dataFindOn3comas?.status || null
          });
      });
    });

    const promises2 = tradesDataExistOn3CommasButNotOnRedis.map(async (x) => {
      // x = `smart_trade_id:((xxxx))`
      // TO DO : check if the non-existent trade exist on firestore
      // update trade data to both fireabase and REDIS
      const arr = [];
      const q = await adminDb.collection('3commas_logs').where('smart_trade_id', '==', String(x.split(':')[1])).get();
      q.forEach((doc) => {
        arr.push({ id: doc.id, ...doc.data() });
      });
      if (arr.length === 0) {
        return `record on firestore not found for:::::::: ${x}`;
      } else {
        let createRecordOnFirestore = arr.find((y) => y.requestBody?.action === 'CREATE');
        if (!createRecordOnFirestore) {createRecordOnFirestore = arr[0];}
        await redisClient.set(x, JSON.stringify(createRecordOnFirestore));
      }
    });
    const allPromises = await Promise.allSettled(promises.concat(promises2));

    return {
      tradesDataExistOn3CommasButNotOnRedis,
      tradesDataExistOnRedisButNotOn3Commas,
      resultPromises: allPromises.map((x) => x.status === 'fulfilled' ? x.value : x.reason)
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
    const result = await redisClient.scan(cursor, {
      MATCH: pattern,
      COUNT: 100
    });

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
  trackApiUsage().then((currentCount) => { console.log("API call count this minute:", currentCount); }).catch((e) => console.error("Error tracking API usage:", e));
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
  return c.json({ message: 'Byscript Hono Checker is running!' });
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
    const stringData = await redisClient.get('smart_trade_id:36299248');
    const data = stringData ? JSON.parse(stringData) : null;
    return c.json({ data, message: 'redis is running' });
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
  port: process.env.PORT || 3000,
  fetch: app.fetch
};

export { checkRedisAndCheck3Commas };
