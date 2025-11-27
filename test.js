// fix-summaries.js - Run this once to fix existing summaries
const fs = require("fs").promises;
const path = require("path");

const SUMMARIES_FILE = path.join(__dirname, "data", "summaries.json");

async function fixSummaries() {
  try {
    console.log("📋 Reading summaries file...");
    const data = await fs.readFile(SUMMARIES_FILE, "utf8");
    const summaries = JSON.parse(data);

    console.log(`Found ${summaries.length} summaries`);

    let fixed = 0;

    for (let summary of summaries) {
      let needsUpdate = false;

      // Fix nextAction if it's an object
      if (summary.nextAction && typeof summary.nextAction === "object") {
        console.log(`Fixing nextAction for session ${summary.sessionId}`);
        const step = summary.nextAction.step || "";
        const timeline = summary.nextAction.timeline || "";
        summary.nextAction = timeline
          ? `${step} (Timeline: ${timeline})`
          : step;
        needsUpdate = true;
      }

      // Add watchOutFor if missing
      if (!summary.watchOutFor) {
        console.log(`Adding watchOutFor for session ${summary.sessionId}`);
        summary.watchOutFor = [
          "Document all interactions and keep copies of all documents",
          "Be aware of deadlines and prescription periods",
          "Seek legal advice if situation escalates",
        ];
        needsUpdate = true;
      }

      if (needsUpdate) {
        fixed++;
      }
    }

    if (fixed > 0) {
      console.log(`💾 Saving ${fixed} fixed summaries...`);
      await fs.writeFile(SUMMARIES_FILE, JSON.stringify(summaries, null, 2));
      console.log("✅ Summaries fixed successfully!");
    } else {
      console.log("✅ All summaries are already in correct format");
    }
  } catch (error) {
    console.error("❌ Error fixing summaries:", error);
  }
}

fixSummaries();
