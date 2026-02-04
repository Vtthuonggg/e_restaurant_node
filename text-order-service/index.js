import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import fetch, { Headers, Request, Response } from "node-fetch";
import { getInfoUser, getProducts, getRoomByName } from "./helpers/db.js";
import { apiKeyToUser, logErrors, clientErrorHandler } from "./helpers/middleware.js";
import { redisConnection } from "./helpers/queue.js";
import { Queue } from "bullmq";

globalThis.fetch = fetch;
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;

dotenv.config();

const app = express();
app.use(express.json());
app.use(apiKeyToUser);
app.use(logErrors);
app.use(clientErrorHandler);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const orderQueue = new Queue("create-order", {
    connection: redisConnection,
});

// Normalize string (remove accents, lowercase)
function normalize(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

// Levenshtein distance
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                ? matrix[i - 1][j - 1]
                : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

// Similarity score
function similarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
}

// Find best matching product
async function findBestProduct(text, products) {
    const normalizedText = normalize(text);

    // Exact match first
    for (const p of products) {
        if (normalize(p.name) === normalizedText) {
            return p;
        }
    }

    // Fuzzy match
    let bestMatch = null;
    let bestScore = 0;

    for (const p of products) {
        const score = similarity(normalizedText, normalize(p.name));
        if (score > bestScore) {
            bestScore = score;
            bestMatch = p;
        }
    }

    return bestScore >= 0.7 ? bestMatch : null;
}

// Parse text using GPT
async function parseText(text) {
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `
Bạn là parser thông minh cho nhà hàng. Phân tích câu và trả về JSON:

{
  "products": [
    { "name": "Tên món", "quantity": 1, "price": 0 }
  ],
  "room": "Tên phòng/bàn hoặc null",
  "note": "Ghi chú hoặc null",
  "discount": 0,
  "discount_type": 1
}

Quy tắc:
- products: Danh sách món ăn, tách bằng dấu phẩy hoặc "và"
- quantity: Số lượng (mặc định 1)
- price: Giá nếu có đề cập, không thì 0
- room: Tên bàn/phòng nếu có (ví dụ: "bàn 1", "phòng VIP")
- discount: Giảm giá nếu có
- discount_type: 1 = VND, 2 = %

Ví dụ:
"2 cơm rang dưa bò bàn 3" -> {"products":[{"name":"cơm rang dưa bò","quantity":2,"price":0}],"room":"bàn 3","note":null,"discount":0,"discount_type":1}
"phở bò, 3 chả giò giảm 10k" -> {"products":[{"name":"phở bò","quantity":1,"price":0},{"name":"chả giò","quantity":3,"price":0}],"room":null,"note":null,"discount":10000,"discount_type":1}
                `
            },
            { role: "user", content: text }
        ],
        temperature: 0,
        response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content);
}

// Build order object
async function buildOrder(parsedData, userId) {
    const products = await getProducts(userId);

    const order_detail = await Promise.all(
        parsedData.products.map(async (p) => {
            const dbProduct = await findBestProduct(p.name, products);

            return {
                product_id: dbProduct?.id || null,
                quantity: p.quantity || 1,
                price: p.price > 0 ? p.price : (dbProduct?.retail_cost || 0),
            };
        })
    );

    let room_id = null;
    if (parsedData.room) {
        const rooms = await getRoomByName(parsedData.room, userId);
        if (rooms.length > 0) {
            room_id = rooms[0].id;
        }
    }

    return {
        type: 1, // Đơn bán
        room_id: room_id,
        room_type: 'using',
        note: parsedData.note || null,
        discount: parsedData.discount || 0,
        discount_type: parsedData.discount_type || 1,
        status_order: 2, // Chưa thanh toán
        payment: null,
        order_detail: order_detail,
        user_id: userId,
    };
}

// Main API endpoint
app.post("/order", async (req, res) => {
    try {
        const { text, mess_id } = req.body;
        if (!text) {
            return res.status(400).json({ error: "Thiếu text đầu vào" });
        }

        console.log("Parsing text:", text);
        const parsedData = await parseText(text);
        console.log("Parsed data:", parsedData);

        const order = await buildOrder(parsedData, req.user.id);
        console.log("Built order:", order);

        // Add to queue
        await orderQueue.add("create-order", {
            order: order,
            user_id: req.user.id,
            apiKey: req.user.apiKey,
            mess_id: mess_id || null,
            text: text,
        });

        res.json({
            status: "success",
            message: "Đơn hàng đang được xử lý",
            parsed: parsedData
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get("/", (req, res) => {
    res.json({ status: "Text Order Service Running" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log("Server running on port", PORT);
});