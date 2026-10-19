"""HTTPS is mocked. Exact integrity and bounded diagnostic output are real checks."""
import http.client,ssl,socket,sys,unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).parent))
from test_activation_window import window,c

class PublicPageProbeTests(unittest.TestCase):
    def run_probe(self,status=200,body=b'temporary',error=None):
        conn=mock.Mock();conn.getresponse.return_value.status=status;conn.getresponse.return_value.read.return_value=body
        conn.request.side_effect=error
        with mock.patch.object(http.client,'HTTPSConnection',return_value=conn) as constructor:
            result=window.temporary_probe({'runId':'a'*32,'nginx':{'temporaryPageSha256':c.digest(b'temporary')}})
        self.assertEqual(constructor.call_args.kwargs['timeout'],10)
        self.assertEqual(conn.request.call_count,1);conn.close.assert_called_once()
        return result
    def test_exact_public_hash(self):
        self.assertEqual(self.run_probe(),{'status':200,'sha256':c.digest(b'temporary'),'bytes':9})
    def test_mismatch_preserves_hash_not_body(self):
        with self.assertRaises(window.PublicPageFailure) as exc:self.run_probe(body=b'synthetic-private-response')
        self.assertEqual(exc.exception.observation,{'kind':'HTTP_INTEGRITY','status':200,'sha256':c.digest(b'synthetic-private-response'),'bytes':26})
        self.assertNotIn('private',str(exc.exception))
    def test_http_rejection_is_not_accepted(self):
        with self.assertRaises(window.PublicPageFailure) as exc:self.run_probe(status=403)
        self.assertEqual(exc.exception.observation['status'],403)
    def test_transport_errors_are_sanitized_without_retries(self):
        for error,kind in ((ssl.SSLError('synthetic secret'),'TLS'),(TimeoutError('secret'),'TIMEOUT'),
                           (socket.gaierror('secret'),'DNS'),(ConnectionError('secret'),'CONNECTION')):
            with self.subTest(kind=kind),self.assertRaises(window.PublicPageFailure) as exc:self.run_probe(error=error)
            self.assertEqual(exc.exception.observation,{'kind':kind});self.assertEqual(str(exc.exception),'TEMPORARY_PUBLIC_PROBE')
