ARG BASE_IMAGE=oraclelinux@sha256:4750c036a007b76bf6269180536c23428ea20f8931edade7701676a2cbae5ce2
FROM ${BASE_IMAGE}
RUN microdnf install -y python3 git gzip tar xz curl gcc-c++ make openssl findutils && microdnf clean all
RUN curl --fail --silent --show-error --location https://nodejs.org/dist/v22.23.2/SHASUMS256.txt -o /tmp/SHASUMS256.txt \
 && curl --fail --silent --show-error --location https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-arm64.tar.xz -o /tmp/node-v22.23.2-linux-arm64.tar.xz \
 && cd /tmp && grep ' node-v22.23.2-linux-arm64.tar.xz$' SHASUMS256.txt | sha256sum --check \
 && test "$(sha256sum node-v22.23.2-linux-arm64.tar.xz | cut -d' ' -f1)" = fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8 \
 && tar -xJf node-v22.23.2-linux-arm64.tar.xz --strip-components=1 -C /usr/local && rm /tmp/node-v22.23.2-linux-arm64.tar.xz /tmp/SHASUMS256.txt
RUN git config --system --add safe.directory /src
