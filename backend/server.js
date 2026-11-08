const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, 'data.json');
const SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';
const CORS = process.env.CORS_ORIGIN || '*';
const seed = {
  users: [
    { id:'u-admin', login:'admin', name:'Администратор', role:'admin', workdayHours:8, passwordHash:hash('admin123') },
    { id:'u-manager', login:'manager', name:'Анна Петрова', role:'manager', workdayHours:8, passwordHash:hash('manager123') },
    { id:'u-supervisor', login:'leader', name:'Руководитель компании', role:'supervisor', workdayHours:8, passwordHash:hash('leader123') },
    { id:'employee1', login:'employee1', name:'Илья Смирнов', role:'employee', workdayHours:8, passwordHash:hash('worker123') },
    { id:'employee2', login:'employee2', name:'Мария Волкова', role:'employee', workdayHours:8, passwordHash:hash('worker123') }
  ], shifts: [], objects: []
};
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const sessions = new Map();

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function save() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function json(res, status, body) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':CORS,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); res.end(JSON.stringify(body)); }
function auth(req) { const raw=req.headers.authorization||''; const token=raw.startsWith('Bearer ')?raw.slice(7):''; const user=sessions.get(token); return user ? {user, token} : null; }
function body(req) { return new Promise((resolve,reject)=>{let data='';req.on('data',c=>{data+=c;if(data.length>1e6)reject(new Error('Payload too large'));});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch(e){reject(e);}});}); }
function safeUser(user) { return {id:user.id,login:user.login,name:user.name,role:user.role,workdayHours:user.workdayHours||8}; }
function canManage(user) { return ['admin','manager','supervisor'].includes(user.role); }
function canCreateObject(user) { return ['admin','manager','supervisor'].includes(user.role); }
function route(req,res) {
  if (req.method==='OPTIONS') return json(res,204,{});
  if (req.method==='GET' && req.url==='/api/health') return json(res,200,{ok:true,service:'timemanager-backend',time:new Date().toISOString()});
  if (req.method==='POST' && req.url==='/api/auth/login') return body(req).then(input=>{const user=db.users.find(x=>x.login===input.login&&x.passwordHash===hash(input.password));if(!user)return json(res,401,{error:'Неверный логин или пароль'});const token=crypto.createHmac('sha256',SECRET).update(user.id+Date.now()+Math.random()).digest('hex');sessions.set(token,safeUser(user));json(res,200,{token,user:safeUser(user)});}).catch(()=>json(res,400,{error:'Некорректный JSON'}));
  const session=auth(req); if(!session) return json(res,401,{error:'Требуется авторизация'});
  if(req.method==='GET'&&req.url==='/api/me') return json(res,200,{user:session.user});
  if(req.method==='GET'&&req.url==='/api/shifts'){if(!canManage(session.user))return json(res,403,{error:'Недостаточно прав'});return json(res,200,{shifts:db.shifts});}
  if(req.method==='GET'&&req.url==='/api/shifts/mine') return json(res,200,{shifts:db.shifts.filter(x=>x.userId===session.user.id)});
  if(req.method==='GET'&&req.url==='/api/objects') return json(res,200,{objects:db.objects||[]});
  if(req.method==='POST'&&req.url==='/api/objects') return body(req).then(input=>{if(!canCreateObject(session.user))return json(res,403,{error:'Создавать объекты могут только руководитель или менеджер'});if(!input.name||!input.address||!input.phone||!input.responsibleId)return json(res,422,{error:'Нужны name, address, phone и responsibleId'});const responsible=db.users.find(x=>x.id===input.responsibleId);if(!responsible||responsible.role==='admin')return json(res,422,{error:'Ответственный не может быть администратором'});const object={id:crypto.randomUUID(),name:input.name,address:input.address,phone:input.phone,responsibleId:responsible.id,responsibleName:responsible.name,createdBy:session.user.id,createdAt:new Date().toISOString(),comments:[]};(db.objects||(db.objects=[])).push(object);save();json(res,201,{object});}).catch(()=>json(res,400,{error:'Некорректный JSON'}));
  if(req.method==='POST'&&req.url.startsWith('/api/objects/')&&req.url.endsWith('/comments')) return body(req).then(input=>{const objectId=req.url.split('/')[3],object=(db.objects||[]).find(x=>x.id===objectId);if(!object)return json(res,404,{error:'Объект не найден'});if(!input.text?.trim())return json(res,422,{error:'Комментарий не может быть пустым'});const comment={id:crypto.randomUUID(),authorId:session.user.id,authorName:session.user.name,text:input.text.trim(),createdAt:new Date().toISOString()};object.comments.push(comment);save();json(res,201,{comment});}).catch(()=>json(res,400,{error:'Некорректный JSON'}));
  if(req.method==='POST'&&req.url==='/api/shifts/events') return body(req).then(input=>{if(session.user.role!=='employee')return json(res,403,{error:'Только сотрудник может отправлять отметки'});if(!['start','end'].includes(input.type)||typeof input.latitude!=='number'||typeof input.longitude!=='number')return json(res,422,{error:'Нужны type, latitude и longitude'});const event={id:crypto.randomUUID(),userId:session.user.id,userName:session.user.name,type:input.type,latitude:input.latitude,longitude:input.longitude,recordedAt:input.recordedAt||new Date().toISOString(),receivedAt:new Date().toISOString(),offline:Boolean(input.offline)};db.shifts.push(event);save();json(res,201,{event});}).catch(()=>json(res,400,{error:'Некорректный JSON'}));
  if(req.method==='GET'&&req.url==='/api/users'){if(session.user.role!=='admin')return json(res,403,{error:'Только администратор'});return json(res,200,{users:db.users.map(safeUser)});}
  if(req.method==='POST'&&req.url==='/api/users'){if(session.user.role!=='admin')return json(res,403,{error:'Только администратор'});return body(req).then(input=>{if(!input.login||!input.password||!input.name||!['admin','manager','supervisor','employee'].includes(input.role))return json(res,422,{error:'Заполните name, login, password и role'});if(db.users.some(x=>x.login===input.login))return json(res,409,{error:'Логин уже существует'});const user={id:crypto.randomUUID(),login:input.login,name:input.name,role:input.role,workdayHours:Number(input.workdayHours||8),passwordHash:hash(input.password)};db.users.push(user);save();json(res,201,{user:safeUser(user)});}).catch(()=>json(res,400,{error:'Некорректный JSON'}));}
  return json(res,404,{error:'Маршрут не найден'});
}
http.createServer((req,res)=>route(req,res).catch(e=>json(res,500,{error:e.message}))).listen(PORT,()=>console.log(`TimeManager API listening on http://localhost:${PORT}`));
