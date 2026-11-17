// Renova o token Centrifugo sem interromper a assinatura da sala.
function maintainToken(
  socket,
  getToken,
  { schedule = setTimeout, cancel = clearTimeout, onFailure = () => {} } = {},
) {
  let timer,
    deadline,
    stopped = false;
  const fail = () => {
    if (stopped) return;
    onFailure();
    socket.terminate();
  };
  const arm = (ttl) => {
    cancel(timer);
    cancel(deadline);
    if (stopped || !Number.isFinite(Number(ttl)) || Number(ttl) <= 0) return;
    const delay = Math.max(
      250,
      Number(ttl) * 1000 - Math.min(30000, Number(ttl) * 200),
    );
    timer = schedule(async () => {
      if (stopped || socket.readyState !== 1) return;
      deadline = schedule(fail, 20000);
      try {
        const token = await getToken();
        if (stopped || socket.readyState !== 1) return;
        if (!token) throw Error('Token ausente');
        socket.send(JSON.stringify({ id: 3, refresh: { token } }));
      } catch {
        fail();
      }
    }, delay);
  };
  socket.once('close', () => {
    stopped = true;
    cancel(timer);
    cancel(deadline);
  });
  return arm;
}
module.exports = { maintainToken };
