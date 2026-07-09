const { fetchUrl } = require("./Main/src/core/network");

async function main() {
  try {
    const html = await fetchUrl("https://www.bing.com/search?q=hello&count=10&first=1&setlang=en-US&cc=US&mkt=en-US&adlt=off");
    console.log("Success! HTML length:", html.length);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
