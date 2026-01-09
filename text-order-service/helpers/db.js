import { pool } from "./connection.js";

export async function getInfoUser(apiKey) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            "SELECT * FROM `users` WHERE api_key = ? LIMIT 1",
            [apiKey]
        );
        return rows;
    } finally {
        connection.release();
    }
}

export async function getProducts(userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            "SELECT id, name, retail_cost, unit FROM products WHERE user_id = ?",
            [userId]
        );
        return rows;
    } finally {
        connection.release();
    }
}

export async function getProductByName(name, userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            "SELECT id, name, retail_cost, unit FROM products WHERE user_id = ? AND name = ? LIMIT 1",
            [userId, name]
        );
        return rows;
    } finally {
        connection.release();
    }
}

export async function getRoomByName(roomName, userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            "SELECT id, name FROM rooms WHERE user_id = ? AND name LIKE ? LIMIT 1",
            [userId, `%${roomName}%`]
        );
        return rows;
    } finally {
        connection.release();
    }
}

export async function getAreaByName(areaName, userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            "SELECT id, name FROM areas WHERE user_id = ? AND name LIKE ? LIMIT 1",
            [userId, `%${areaName}%`]
        );
        return rows;
    } finally {
        connection.release();
    }
}