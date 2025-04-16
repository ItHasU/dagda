module.exports = require("@dagda/build/webpack-server.config")(__dirname, "./src/main.ts", ["express", "express-session", "passport", "passport-google-oauth20", "pg"]);
