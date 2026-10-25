"use strict";
const {translateWithGemini,TRANSLATION_LANGUAGES,DEFAULT_MODEL}=require("./llm.js");
const privacy=require("./anonymise.js");
const crypto=require("node:crypto");
const MAX_TEXT=8000;
function shieldCriticalText(text){
 const nonce=crypto.randomBytes(6).toString("hex"),tokens=[];
 const protectedText=String(text).replace(/`[^`\n]{1,160}`|\bS\d+\b|\b(?:[A-Za-z_$][\w$]*(?:_[A-Za-z0-9_$]+|[A-Z][A-Za-z0-9_$]*)+|[A-Z]{2,}[A-Z0-9_]*)\b|\b\d+(?:[.,]\d+)?%?\b/g,match=>{
  const marker=`[[TG_${nonce}_${tokens.length}]]`;tokens.push({marker,value:match});return marker;
 });
 return {text:protectedText,restore(value){let out=String(value||"");for(const token of tokens){const occurrences=out.split(token.marker).length-1;if(occurrences!==1)throw Error("Gemini changed a protected score or code identifier. The original feedback is unchanged.");out=out.replace(token.marker,token.value);}return out;}};
}
function validate(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return {error:"Request body must be a JSON object."};
 const text=typeof input.text==="string"?input.text.trim():"";
 if(!text)return {error:"Feedback text is required."};
 if(text.length>MAX_TEXT)return {error:`Feedback is too long (limit ${MAX_TEXT} characters).`};
 if(!Object.hasOwn(TRANSLATION_LANGUAGES,String(input.language||"")))return {error:"Choose Hindi, Hinglish, Bengali, Tamil, Telugu, Marathi, or Kannada."};
 const options=input.privacy&&typeof input.privacy==="object"?input.privacy:{};
 const names=Array.isArray(options.studentNames)?options.studentNames.slice(0,500).map(x=>String(x||"").trim().slice(0,100)).filter(Boolean):[];
 return {value:{text,language:String(input.language),tone:input.tone==="direct"?"direct":"warm",privacy:{anonymise:options.anonymise!==false,stripIdentifiers:options.stripIdentifiers!==false,studentNames:names}}};
}
async function translate(input,env={},deps={}){
 const checked=validate(input);
 if(checked.error)return {status:400,body:{error:checked.error}};
 if(!env.GEMINI_API_KEY)return {status:501,body:{error:"Feedback translation is unavailable offline. Configure GEMINI_API_KEY to enable translation."}};
 const value=checked.value;
 const protectedInput=privacy.prepare({submission:{student:"",code:""},notes:value.text,privacy:{...value.privacy,sendCode:false}});
 try{
  const shielded=shieldCriticalText(protectedInput.payload.notes);
  const translated=await translateWithGemini({text:shielded.text,language:value.language,tone:value.tone,apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||DEFAULT_MODEL,fetchImpl:deps.fetchImpl});
  const restored=privacy.restore({feedback:shielded.restore(translated.trim())},protectedInput.names).feedback;
  if(!restored)return {status:502,body:{error:"Gemini returned an empty translation. The original feedback is unchanged."}};
  return {status:200,body:{text:restored,engine:"gemini"}};
 }catch(error){const preservationError=String(error.message||"").startsWith("Gemini changed a protected");return {status:error.status||502,body:{error:error.status===400||preservationError?error.message:"Gemini could not translate this feedback. The original feedback is unchanged."}};}
}
module.exports={translate,validate,MAX_TEXT,shieldCriticalText};
