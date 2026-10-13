import env from "./config/env.js";
import app from "./app.js";
import * as Scan from "./models/scan.model.js";

const recovered = await Scan.markStaleFailed();
if (recovered.count > 0) {
  console.log(`Marked ${recovered.count} unfinished scan(s) as failed`);
}

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
});
