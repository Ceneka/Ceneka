//include marker
import { Marked } from "marked"
import fs from "fs"

//read README.md
const readme = fs.readFileSync("./README.md", "utf-8")
//read template.html
const template = fs.readFileSync("./template.html", "utf-8")

const renderer = new Marked()
const cv_html = await renderer.parse(readme)

//replace {{HTML_CV_CONTENT}} with html
const output = template.replace("{{HTML_CV_CONTENT}}", cv_html)

//create build folder if it doesn't exist
if (!fs.existsSync("./build")) {
    fs.mkdirSync("./build")
}

//write it to index.html
fs.writeFileSync("./build/index.html", output)
