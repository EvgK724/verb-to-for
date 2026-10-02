import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONTENT as C} from '../content.js';
import {DAY,freshState,checkAnswer,planReview,buildQueue,applyGrade,validateState} from '../engine.js';
const now=Date.UTC(2026,9,2,8),ids=C.cards.map(c=>c.id);
test('26 progressive lessons, 130 models, 260 unique contextual tasks; every authored answer is accepted',()=>{
 assert.equal(C.lessons.length,26);assert.equal(new Set(ids).size,260);
 for(const l of C.lessons){const cards=C.cards.filter(c=>c.lesson===l.id);assert.equal(cards.length,10);assert.equal(new Set(cards.map(c=>c.kind)).size,4);assert(l.rule.length>=3);}
 for(const c of C.cards){assert.equal((c.prompt.match(/___/g)||[]).length,1);assert.equal(new Set(c.options).size,3);assert(c.context.trim()&&c.ru.length>10);assert(checkAnswer(c,c.kind==='fix'?c.full:c.answer));assert(checkAnswer(c,c.why,'why'));assert(!checkAnswer(c,c.incorrect,'fix'));for(const wrong of c.options.filter(x=>x!==c.answer&&!c.alternatives.includes(x)))assert(!checkAnswer(c,wrong,'choice'));}
});
test('Intentional empty slot accepts Ø/0/none; empty answer is never silently correct',()=>{
 const c=C.cards.find(c=>c.answer==='Ø');for(const value of ['Ø','ø','0','нет','Без связки','без предлога','—','-','none'])assert(checkAnswer(c,value,'gap'));for(const value of ['',' ','to','for'])assert(!checkAnswer(c,value,'gap'));
 const fix=C.cards.find(c=>c.kind==='fix');assert(checkAnswer(fix,fix.full.toUpperCase().replace('.','!'),'fix'));
});
test('Default font is 18; Verb backup cannot import Tense data; 20/22 persist',()=>{
 const s=freshState(now);assert.equal(s.settings.font,18);for(const size of [18,20,22]){s.settings.font=size;assert.equal(validateState(s,ids).settings.font,size);}
 assert.throws(()=>validateState({...s,app:'tense'},ids));assert.throws(()=>validateState({schema:1,cards:{}},ids));
});
test('Every visible phrase has verified Ryan audio and every manifest path exists',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../audio-manifest.json',import.meta.url)));assert.equal(m.voice,'en-GB-RyanNeural');
 const expected=[...C.cards.map(c=>c.full),...C.lessons.map(l=>l.good),...C.anchors.map(v=>v.en),...C.signals.map(x=>x.en),...C.contrasts.flatMap(c=>[c.a,c.b]),...C.patterns.map(p=>p.model.replaceAll(' / ',' or ').replace('(to)','to'))];
 for(const t of expected){assert(m.files[t],t);assert(m.files[t].seconds>.2);assert(fs.statSync(new URL('../'+m.files[t].src,import.meta.url)).size>1000);}
});
test('Scheduling progresses when due; failure in 10 minutes; recovery tomorrow; early review cannot inflate',()=>{
 let r=planReview({},'good',now);assert.equal(r.due,now+DAY);assert.equal(planReview(r,'easy',now+1000).due,r.due);r=planReview(r,'good',now+DAY);assert.equal(r.interval,3);r=planReview(r,'again',now+DAY);assert.equal(r.due,now+DAY+600000);r=planReview(r,'easy',now+DAY+1000,true);assert.equal(r.interval,1);
});
test('Due priority, gradual curriculum, correct lesson filters and all mixed modes have starter cards',()=>{
 const s=freshState(now);assert(buildQueue(C.cards,s,{now}).every(id=>id.startsWith('two-jobs-')));
 s.cards[ids[57]]=planReview({},'again',now-700000);assert.equal(buildQueue(C.cards,s,{now})[0],ids[57]);assert.deepEqual(buildQueue(C.cards,s,{now,mode:'due'}),[ids[57]]);
 for(const mode of ['why','listen','recall','mixed'])assert.equal(buildQueue(C.cards,s,{now,mode}).length,10);
 assert(buildQueue(C.cards,s,{now,lesson:'academic-inf',mode:'why'}).every(id=>id.startsWith('academic-inf-')));
});
test('Errors clear only after successful recall on two distinct later days',()=>{
 const s=freshState(now),c=C.cards[0];applyGrade(s,c,'again',{now,wrong:true});applyGrade(s,c,'good',{now:now+1000,recovery:true});assert.equal(s.mistakes[c.id].successDays.length,0);applyGrade(s,c,'good',{now:now+DAY});applyGrade(s,c,'good',{now:now+DAY+1000});assert(!s.mistakes[c.id].resolved);applyGrade(s,c,'good',{now:now+2*DAY});assert(s.mistakes[c.id].resolved);
});
test('Backup round trip preserves real progress and why session; rejects invalid settings and IDs',()=>{
 const s=freshState(now);applyGrade(s,C.cards[0],'good',{now});s.session={mode:'why',lesson:null,queue:ids.slice(0,10),index:1,initial:10,results:[],retries:{},failed:[],started:now};const restored=validateState(JSON.parse(JSON.stringify(s)),ids);assert.deepEqual(restored.cards,s.cards);assert.equal(restored.session.mode,'why');const hostile={...s,cards:{...s.cards,unknown:{due:123,stage:0,interval:1}},settings:{rate:99,font:999}};const safe=validateState(hostile,ids);assert.equal(safe.settings.font,18);assert.equal(safe.cards.unknown,undefined);
});

test('Dictionary models and examples are linked; multiple valid help forms are accepted',()=>{
 assert.equal(C.patterns.length,130);assert.equal(new Set(C.patterns.map(p=>p.id)).size,130);
 for(const p of C.patterns){assert.equal(p.cardIds.length,2);assert(C.lessons.some(l=>l.id===p.lesson));for(const id of p.cardIds){const c=C.cards.find(c=>c.id===id);assert.equal(c.pattern,p.id);assert.equal(c.lesson,p.lesson);}}
 for(const c of C.cards.filter(c=>c.pattern==='help-optional')){for(const value of ['to','Ø','0','нет'])assert(checkAnswer(c,value,'gap'));assert(!checkAnswer(c,'for','gap'));assert(!checkAnswer(c,'','gap'));for(const full of [c.full,...c.fullAlternatives])assert(checkAnswer(c,full,'fix'));}
 const forward=C.cards.find(c=>c.pattern==='look-forward-to'&&c.task==='form');assert(forward);assert(checkAnswer(forward,forward.answer,'gap'));for(const opt of forward.options.filter(o=>o!==forward.answer))assert(!checkAnswer(forward,opt,'gap'));
 assert.throws(()=>validateState({...freshState(),app:'article'},ids));
});
