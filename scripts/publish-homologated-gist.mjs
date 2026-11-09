import fs from "node:fs";
const gistId = "11918b7196b3ee6a0d8a91739167b312";
const token = process.env.GIST_TOKEN;
if (!token) throw new Error("GIST_TOKEN ausente; Gist não foi alterado.");
const content = fs.readFileSync("rebuild-output/catalogo.json", "utf8");
const response = await fetch("https://api.github.com/gists/" + gistId, {
  method: "PATCH",
  headers: {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  },
  body: JSON.stringify({ files: { "catalogo.json": { content: "\uFEFF" + content } } })
});
if (!response.ok) throw new Error("GitHub Gist API " + response.status + ": " + (await response.text()).slice(0, 1000));
const result = await response.json();
console.log(JSON.stringify({ gistId: result.id, updated_at: result.updated_at, html_url: result.html_url, file: result.files?.["catalogo.json"]?.filename }));
