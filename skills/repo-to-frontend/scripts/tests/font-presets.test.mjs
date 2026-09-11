import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.R2F_PLAYWRIGHT_MODULE||'playwright');
const css=readFileSync(new URL('../../assets/font-presets.css',import.meta.url),'utf8');
let browser,page;
beforeAll(async()=>{browser=await chromium.launch();page=await browser.newPage()});
afterAll(async()=>browser?.close());
test.each([['heiti','SimHei'],['kaiti','KaiTi'],['yahei','Microsoft YaHei'],['songti','SimSun']])('profile %s inherits the requested stack into text and controls',async(profile,family)=>{
 await page.setContent(`<style>${css}</style><main class="r2f-fonts" data-r2f-cjk="${profile}"><span>中文 ABC 123</span><button>重算</button><input value="12"><textarea>ABC</textarea><select><option>123</option></select><svg><text>ABC</text></svg></main><div id="outside" style="font-family:monospace">outside</div>`);
 const styles=await page.locator('main span,main button,main input,main textarea,main select,main text').evaluateAll(es=>es.map(e=>getComputedStyle(e).fontFamily));
 expect(styles).toHaveLength(6);
 for(const value of styles){expect(value.startsWith('"Times New Roman",')).toBe(true);expect(value).toContain(family);}
 expect(await page.locator('#outside').evaluate(e=>getComputedStyle(e).fontFamily)).toBe('monospace');
});
