/* Ping de transporte detecta conexões presas sem confundir chat quieto com falha. */
function monitorSocket(
  socket,
  {
    interval = 30000,
    schedule = setInterval,
    cancel = clearInterval,
    onTimeout = () => {},
  } = {},
) {
  let waiting = false;
  const pong = () => {
    waiting = false;
  };
  socket.on('pong', pong);
  const timer = schedule(() => {
    if (socket.readyState !== 1) return;
    if (waiting) {
      onTimeout();
      socket.terminate();
      return;
    }
    waiting = true;
    try {
      socket.ping();
    } catch {
      socket.terminate();
    }
  }, interval);
  timer?.unref?.();
  const stop = () => {
    cancel(timer);
    socket.off('pong', pong);
  };
  socket.once('close', stop);
  return stop;
}
module.exports = { monitorSocket };
