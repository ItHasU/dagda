"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerApp = void 0;
const app_1 = require("@dagda/server/src/app");
class ServerApp extends app_1.AbstractServerApp {
    /** @inheritdoc */
    async _isUserValid(profile) {
        console.log("User profile:", JSON.stringify(profile));
        return true;
    }
}
exports.ServerApp = ServerApp;
//# sourceMappingURL=app.js.map