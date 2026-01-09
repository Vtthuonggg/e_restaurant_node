import { getInfoUser } from "./db.js";

export async function apiKeyToUser(req, res, next) {
    let { apiKey } = req.query;
    if (!apiKey) {
        return res.status(422).json({ error: "Missing apiKey" });
    }

    apiKey = apiKey.toLowerCase().replace(/\/?delete|select|update/gm, "");
    const info = await getInfoUser(apiKey);

    if (info.length === 0) {
        return res.status(422).json({ error: "User not exist" });
    }

    req.user = {
        id: info[0].id,
        apiKey,
        store_name: info[0].store_name,
        name: info[0].name
    };
    next();
}

export async function logErrors(err, _req, _res, next) {
    console.error(err.stack);
    next(err);
}

export async function clientErrorHandler(err, _req, res, _next) {
    return res.status(500).send({ message: err.message, stack: err.stack });
}