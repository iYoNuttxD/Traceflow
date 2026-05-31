// Controller de rastreabilidade. Os vinculos manuais serao delegados ao service.
// TODO: Preparar RF09, RF11, RF12, RF48, RF49, RF52 e RF53.
export const traceabilityController = {
  async notImplemented(req, res) {
    return res.status(501).json({ message: 'Traceability endpoint prepared for future development.' });
  }
};
