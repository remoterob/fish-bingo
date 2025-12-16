// netlify/functions/fb-post.mjs
import { createClient } from "@supabase/supabase-js";

// --- CONFIG --- //
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Helper: Get existing Facebook photo URLs --- //
async function getExistingFacebookPhotos() {
  const url = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/posts?fields=attachments{media_type,media,url,subattachments}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${FB_ACCESS_TOKEN}` },
  });
  const data = await res.json();
  if (!data?.data) return new Set();

  const urls = new Set();
  for (const post of data.data) {
    const attach = post.attachments?.data?.[0];
    if (attach?.media?.image?.src) urls.add(attach.media.image.src);
    if (attach?.subattachments?.data) {
      attach.subattachments.data.forEach((sa) => {
        if (sa?.media?.image?.src) urls.add(sa.media.image.src);
      });
    }
  }
  return urls;
}

// --- Helper: Post image to Facebook --- //
async function postToFacebook(imageUrl, caption) {
  const res = await fetch(`https://graph.facebook.com/${FB_PAGE_ID}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: imageUrl,
      caption: caption,
      access_token: FB_ACCESS_TOKEN,
    }),
  });
  const result = await res.json();
  if (!result.id) console.error("❌ FB Post failed:", result);
  else console.log("✅ FB Post success:", result.id);
  return result;
}

// --- Helper: Clean caption --- //
function cleanCaption(text) {
  // remove all hashtags and trailing whitespace
  return text.replace(/#[^\s#]+/g, "").replace(/\n{2,}/g, "\n").trim();
}

// --- Leaderboard post --- //
async function postLeaderboard(existingImages, summary) {
  const today = new Date();
  const isMonday = today.getDay() === 1;
  if (!isMonday) {
    summary.push("⏭️ Skipped leaderboard (not Monday)");
    return;
  }

  const { data, error } = await supabase.rpc("weekly_leaderboard_view");
  if (error || !data) {
    summary.push("❌ Failed to fetch leaderboard");
    return;
  }

  const imageUrl = "https://fishbingo.netlify.app/assets/leaderboard-banner.jpg";
  const caption = cleanCaption(
    `🏆 Weekly Leaderboard Update 🏆

Top divers this week:
${data
  .slice(0, 5)
  .map((r, i) => `${i + 1}. ${r.name} – ${r.score} pts`)
  .join("\n")}

Check out more on Fish Bingo!`
  );

  if (existingImages.has(imageUrl)) {
    summary.push("⏭️ Duplicate leaderboard post skipped");
    return;
  }

  await postToFacebook(imageUrl, caption);
  summary.push("✅ Leaderboard post created");
}

// --- Latest Dishes post --- //
async function postDishes(existingImages, summary) {
  const { data, error } = await supabase
    .from("dishes_view")
    .select("dish_name, image_url, profile_name, species_name, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data?.length) {
    summary.push("❌ No dishes found");
    return;
  }

  const dish = data[0];
  if (existingImages.has(dish.image_url)) {
    summary.push("⏭️ Duplicate dish image skipped");
    return;
  }

  const caption = cleanCaption(
    `🍽️ Catch & Cook: ${dish.dish_name}
${dish.profile_name} prepared a delicious ${dish.species_name}!

See more inspiration at https://fishbingo.netlify.app/inspiration`
  );

  await postToFacebook(dish.image_url, caption);
  summary.push(`✅ Posted new dish: ${dish.dish_name}`);
}

// --- Latest Catches post --- //
async function postCatches(existingImages, summary) {
  const { data, error } = await supabase
    .from("claims")
    .select(
      "id, species:species_id(common_name), photo_url, profiles(display_name), created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data?.length) {
    summary.push("❌ No catches found");
    return;
  }

  const catchItem = data[0];
  const imageUrl = catchItem.photo_url;
  if (existingImages.has(imageUrl)) {
    summary.push("⏭️ Duplicate catch image skipped");
    return;
  }

  const caption = cleanCaption(
    `🎣 Latest Catch!
${catchItem.profiles.display_name} landed a ${catchItem.species.common_name}!`
  );

  await postToFacebook(imageUrl, caption);
  summary.push(`✅ Posted new catch: ${catchItem.species.common_name}`);
}

// --- MAIN HANDLER --- //
export const handler = async () => {
  const summary = [];
  try {
    console.log("🚀 Starting Facebook post consolidation");

    const existingImages = await getExistingFacebookPhotos();

    await Promise.all([
      postLeaderboard(existingImages, summary),
      postDishes(existingImages, summary),
      postCatches(existingImages, summary),
    ]);

    console.log("📋 Summary:\n" + summary.join("\n"));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "FB posts processed successfully",
        summary,
      }),
    };
  } catch (err) {
    console.error("❌ FB post function error:", err);
    summary.push("❌ FB post error: " + err.message);
    return { statusCode: 500, body: JSON.stringify({ summary }) };
  }
};
