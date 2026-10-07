const play=document.querySelector('#listen-play'),stop=document.querySelector('#listen-stop'),speed=document.querySelector('#listen-speed'),voice=document.querySelector('#listen-voice'),status=document.querySelector('#listen-status');
if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)){status.textContent='Audio reading is unavailable in this browser. Try a browser with text-to-speech support.'}else{
 const synth=window.speechSynthesis;
 const text=[...document.querySelectorAll('.reader>h1,.reader>.standfirst,.article-body>p,.article-body>h2')].map(n=>n.textContent.replace(/https?:\/\/\S+/g,'').trim()).filter(Boolean).join('\n');
 const chunks=text.match(/\S[\s\S]{0,199}(?:\s|$)|\S+/g)||[];
 let index=0,mode='idle',generation=0,current=null,voices=[];
 function controls(){play.disabled=!chunks.length;play.textContent=mode==='playing'?'Pause':mode==='paused'?'Resume':'Play';stop.disabled=mode==='idle'}
 function loadVoices(){const selected=voice.value;voices=synth.getVoices().filter(v=>/^en(?:-|$)/i.test(v.lang));voice.replaceChildren(new Option('Device default',''));for(const v of voices)voice.add(new Option(v.name+' ('+v.lang+')',v.voiceURI));if(voices.some(v=>v.voiceURI===selected))voice.value=selected}
 function speak(){if(index>=chunks.length){mode='idle';index=0;status.textContent='Finished reading.';controls();return}const gen=++generation;current=new SpeechSynthesisUtterance(chunks[index]);current.lang='en-GB';current.rate=Number(speed.value);const selected=voices.find(v=>v.voiceURI===voice.value);if(selected)current.voice=selected;current.onend=()=>{if(gen!==generation)return;index++;if(mode==='playing')speak()};current.onerror=e=>{if(gen!==generation)return;mode='idle';index=0;status.textContent='Audio could not play. Check your device voice settings and try Play again.';controls()};status.textContent='Reading · '+Math.round(index/chunks.length*100)+'%';synth.speak(current)}
 function reset(){generation++;mode='idle';index=0;synth.cancel();current=null;controls()}
 play.addEventListener('click',()=>{if(mode==='playing'){mode='paused';synth.pause();status.textContent='Paused.'}else if(mode==='paused'){mode='playing';synth.resume();status.textContent='Reading…';if(!synth.speaking)speak()}else{generation++;synth.cancel();synth.resume();mode='playing';speak()}controls()});
 stop.addEventListener('click',()=>{reset();status.textContent='Stopped. Press Play to start again.'});
 for(const control of [speed,voice])control.addEventListener('change',()=>{if(mode==='idle')return;const paused=mode==='paused';generation++;synth.cancel();synth.resume();mode='playing';speak();if(paused){mode='paused';synth.pause();status.textContent='Paused.'}controls()});
 window.addEventListener('pagehide',reset);synth.addEventListener('voiceschanged',loadVoices);loadVoices();status.textContent='Ready to listen.';controls();
}
