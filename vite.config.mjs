import {defineConfig} from 'vite';
export default defineConfig({build:{copyPublicDir:false},server:{host:'127.0.0.1',port:1441,strictPort:true,watch:{ignored:['**/src-tauri/**','**/art/**']}},clearScreen:false});
