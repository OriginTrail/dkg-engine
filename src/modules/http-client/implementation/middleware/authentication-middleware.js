const parseIp = (req) => {
    let xForwardedFor;
    let socketRemoteAddress;

    if (req.socket) {
        socketRemoteAddress = req.socket.remoteAddress;
    }

    return xForwardedFor || socketRemoteAddress;
};

export default (authService) => async (req, res, next) => {
    // eslint-disable-next-line no-useless-escape
    const match = req.path.match(/^\/(?:v[0-9]+\/)?([^\/\?]+)/);
    if (!match) return res.status(404).send('Not found.');

    const operation = match[0].substring(1).toUpperCase();

    if (authService.isPublicOperation(operation)) {
        return next();
    }

    const ip = parseIp(req);

    const token =
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer ') &&
        req.headers.authorization.split(' ')[1];

    const isAuthenticated = await authService.authenticate(ip, token);

    if (!isAuthenticated) {
        return res.status(401).send('Unauthenticated.');
    }

    next();
};
