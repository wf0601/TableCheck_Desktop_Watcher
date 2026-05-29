import { loadProfile } from "../src/config.js";
import { autoSignIn } from "../src/prefiller.js";

const profile = loadProfile();
console.log("account:", profile.tablecheck_account, "password set:", !!profile.tablecheck_password);
const result = await autoSignIn(profile);
console.log("Result:", result);
