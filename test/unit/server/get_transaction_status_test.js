describe("Server#getTransactionStatus", function() {
  let keypair = SorobanClient.Keypair.random();
  let account = new SorobanClient.Account(
    keypair.publicKey(),
    "56199647068161",
  );

  beforeEach(function() {
    this.server = new SorobanClient.Server(serverUrl);
    this.axiosMock = sinon.mock(AxiosClient);
    let transaction = new SorobanClient.TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: SorobanClient.Networks.TESTNET,
      v1: true,
    })
      .addOperation(
        SorobanClient.Operation.payment({
          destination:
            "GASOCNHNNLYFNMDJYQ3XFMI7BYHIOCFW3GJEOWRPEGK2TDPGTG2E5EDW",
          asset: SorobanClient.Asset.native(),
          amount: "100.50",
        }),
      )
      .setTimeout(SorobanClient.TimeoutInfinite)
      .build();
    transaction.sign(keypair);

    this.transaction = transaction;
    this.hash = this.transaction.hash().toString("hex");
    this.blob = transaction
      .toEnvelope()
      .toXDR()
      .toString("base64");
  });

  afterEach(function() {
    this.axiosMock.verify();
    this.axiosMock.restore();
  });

  it("transaction not found", function(done) {
    this.axiosMock
      .expects("post")
      .withArgs(serverUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransactionStatus",
        params: [this.hash],
      })
      .returns(Promise.resolve({ data: { id: 1, error: { code: 404 } } }));

    this.server
      .getTransactionStatus(this.hash)
      .then(function(_response) {
        done(new Error("Expected error"));
      })
      .catch(function(err) {
        done(
          err.code == 404
            ? null
            : new Error("Expected error code 404, got: " + err.code),
        );
      });
  });

  xit("transaction pending", function(done) {});

  xit("transaction success", function(done) {});

  xit("transaction error", function(done) {});
});
