export function preflight() {
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    },
    body: ''
  };
}
export function json(status, obj) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    },
    body: JSON.stringify(obj)
  };
}
export const ok = (obj)=> json(200, obj);
export const bad = (msg, code=400)=> json(code, { errorType:'Error', errorMessage: msg });
