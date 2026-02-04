import { Worker } from "bullmq";
import { redisConnection } from "../helpers/queue.js";
import { Manager } from "socket.io-client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const worker = new Worker(
    "create-order",
    async (job) => {
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📦 Processing order job:", job.id);
        console.log("📝 Job data:", JSON.stringify(job.data, null, 2));

        const manager = new Manager(process.env.SOCKET_IO_URL || "http://localhost:3000", {
            autoConnect: true,
        });
        const socket = manager.socket("/order");

        try {
            const laravelUrl = `${process.env.LARAVEL_API_URL || "http://172.20.10.2:8000/api"}/qr-order/create`;
            const payload = {
                apiKey: job.data.apiKey,
                roomId: job.data.order.room_id ? Buffer.from(job.data.order.room_id.toString()).toString('base64') : null,
                order_detail: job.data.order.order_detail,
                note: job.data.order.note,
                discount: job.data.order.discount || 0,
                discount_type: job.data.order.discount_type || 1,
            };

            console.log("🌐 Calling Laravel API:", laravelUrl);
            console.log("📤 Payload:", JSON.stringify(payload, null, 2));

            // Call Laravel API to create order
            const response = await axios.post(laravelUrl, payload, {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 10000, // 10s timeout
            });

            console.log("📥 Laravel response status:", response.status);
            console.log("📥 Laravel response data:", JSON.stringify(response.data, null, 2));

            const result = response.data;

            if (result.status === "success") {
                console.log("✅ Order created successfully!");
                console.log("   Order ID:", result.data?.order?.id || result.data?.order_id);
                
                // Emit socket notification
                if (result.data?.socket_data) {
                    socket.emit("order:create", {
                        ...result.data.socket_data,
                        mess_id: job.data.mess_id,
                    });
                    console.log("🔔 Socket notification sent");
                }
            } else {
                throw new Error(result.message || "Order creation failed");
            }

            return { success: true, orderId: result.data?.order?.id };
        } catch (error) {
            console.error("❌ Order creation error:");
            console.error("   Message:", error.message);
            
            if (error.response) {
                console.error("   Status:", error.response.status);
                console.error("   Data:", JSON.stringify(error.response.data, null, 2));
            }
            
            if (error.code === 'ECONNREFUSED') {
                console.error("   Laravel API is not reachable!");
            }

            // Emit error to socket
            socket.emit("order:create", {
                user_id: job.data.user_id,
                mess_id: job.data.mess_id,
                error: error.response?.data?.message || error.message,
            });

            throw error; // Re-throw để BullMQ retry nếu cần
        } finally {
            socket.disconnect();
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        }
    },
    { 
        connection: redisConnection,
        concurrency: 5,
        limiter: {
            max: 10,
            duration: 1000, // 10 jobs per second max
        }
    }
);

worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err.message);
});

worker.on("error", (err) => {
    console.error("Worker error:", err);
});

console.log("🚀 Worker started - listening for 'create-order' jobs");
console.log("   Redis:", `${redisConnection.host || 'localhost'}:${redisConnection.port || 6379}`);
console.log("   Laravel API:", process.env.LARAVEL_API_URL || "http://172.20.10.2:8000/api");
console.log("   Socket.IO:", process.env.SOCKET_IO_URL || "http://localhost:3000");