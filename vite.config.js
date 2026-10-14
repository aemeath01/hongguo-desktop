import {defineConfig} from 'vite';
export default defineConfig({
  server:{watch:{ignored:['**/work/**','**/releases/**','**/runtime/**','**/src-tauri/target/**','**/data/EBWebView/**','**/data/services/**','**/data/enhancements/**','**/data/hls/**','**/data/staging/**']}},
});
