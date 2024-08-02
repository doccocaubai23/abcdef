
const { Web3 } = require('web3');
const fs = require('fs');

const abiContent = JSON.parse(fs.readFileSync('./abi.json', 'utf8'));
const web3 = new Web3('https://arb1.arbitrum.io/rpc');

const contractAddress = '0x1cdc19b13729f16c5284a0ace825f83fc9d799f4';

const contract = new web3.eth.Contract(abiContent, contractAddress);



// Private keys for Metamask
const privateKeybear = ''; // Thêm private key cho Bear betting
const privateKeybull = ''; // Thêm private key cho Bull betting
// Giá trị đặt cược, tối thiểu 0.00001 eth trên mạng Arbitrum
const betValue = 0.001;

// Số dư ETH tối thiểu trong ví
const minBalance = 0.00001;
const minRequiredBalance = 0.001;

const checkBalances = async () => {
  const walletBear = web3.eth.accounts.privateKeyToAccount(`0x${privateKeybear}`);
  const balanceBear = await web3.eth.getBalance(walletBear.address);
  const balanceBearInWei = web3.utils.fromWei(balanceBear, 'ether');

  const walletBull = web3.eth.accounts.privateKeyToAccount(`0x${privateKeybull}`);
  const balanceBull = await web3.eth.getBalance(walletBull.address);
  const balanceBullInWei = web3.utils.fromWei(balanceBull, 'ether');

  if (Number(balanceBearInWei) < minRequiredBalance || Number(balanceBullInWei) < minRequiredBalance) {
    console.log(`Số dư của một trong hai ví quá ít, Bear: ${balanceBearInWei}, Bull: ${balanceBullInWei}`);
    process.exit(1);
  }
};

const bet = async (privateKey, betType) => {
  console.log('\n==================== STARTING ====================\n');
  const wallet = web3.eth.accounts.privateKeyToAccount(`0x${privateKey}`);
  const address = wallet.address;
  const balance = await web3.eth.getBalance(address);
  const balanceInWei = web3.utils.fromWei(balance, 'ether');
  console.log(`Số dư còn lại: ${balanceInWei}`);

  if (Number(balanceInWei) < minBalance) {
    console.log(`Số dư trong ví còn quá ít, số dư: ${balanceInWei}`);
  } else {
    const betValueInWei = web3.utils.toWei(betValue.toString(), 'ether');
    const currentEpoch = await contract.methods.currentEpoch().call();

    // 1.Claim reward của 5 epoch trước đó
    await claimEpoch(currentEpoch, address, privateKey);

    // 2.Kiểm tra epoch hiện tại có thể đặt cược không
    const isBet = await hasBet(currentEpoch, wallet.address);

    if (isBet) {
      console.log(`Bạn đã đặt cược epoch ${currentEpoch} rồi \n`);
    } else {
      // 3. Đặt cược
      try {
        let nonce = await web3.eth.getTransactionCount(wallet.address, 'pending');
        const gasPrice = await web3.eth.getGasPrice();

        const gasEstimate = await web3.eth.estimateGas({
          from: wallet.address,
          to: contractAddress,
          data: contract.methods[betType](currentEpoch).encodeABI(),
          value: betValueInWei,
        });

        const txn = {
          to: contractAddress,
          data: contract.methods[betType](currentEpoch).encodeABI(),
          gas: gasEstimate,
          gasPrice: gasPrice + BigInt(gasPrice) / 5n,
          nonce,
          value: betValueInWei,
        };

        console.log(`Đang đặt cược, epoch: ${currentEpoch}`);
        const signedTxn = await web3.eth.accounts.signTransaction(txn, privateKey);
        const txHash = await web3.eth.sendSignedTransaction(signedTxn.rawTransaction);
        console.log(`Đặt cược thành công epoch: ${currentEpoch}, tx: ${txHash.transactionHash}`);
      } catch (error) {
        console.log('Đã xảy ra lỗi, ', error);
      }
    }
  }
  console.log('====================== END ======================\n');
};

const hasBet = async (epoch, address) => {
  try {
    const betInfo = await contract.methods.ledger(epoch, address).call();
    return betInfo[1] > 0;
  } catch (error) {
    console.log(`\nLỗi kiểm tra đặt cược, epoch: ${epoch}: ${error}`);
    return false;
  }
};

const claimEpoch = async (currentEpoch, address, privateKey) => {
  for (let epoch = currentEpoch - 5n; epoch < currentEpoch; epoch++) {
    const claimable = await contract.methods.claimable(epoch, address).call();
    if (claimable) {
      console.log(`Đang claim reward epoch ${epoch}`);
      try {
        const gasEstimate = await web3.eth.estimateGas({
          from: address,
          to: contractAddress,
          data: contract.methods.claim([epoch]).encodeABI(),
        });
        let nonce = await web3.eth.getTransactionCount(address, 'pending');
        const gasPrice = await web3.eth.getGasPrice();

        const txn = {
          to: contractAddress,
          data: contract.methods.claim([epoch]).encodeABI(),
          gas: gasEstimate,
          gasPrice: gasPrice + BigInt(gasPrice) / 5n,
          nonce,
        };
        const signedTxn = await web3.eth.accounts.signTransaction(txn, privateKey);
        const txHash = await web3.eth.sendSignedTransaction(signedTxn.rawTransaction);
        console.log(`Claim thành công reward epoch: ${epoch}, tx: ${txHash.transactionHash}`);
      } catch (error) {
        console.error(`Lỗi khi claim reward ở epoch ${epoch}: ${error}`);
      }
    }
  }
};

// Function for Bear betting
const betBear = async () => {
  await checkBalances();
  await bet(privateKeybear, 'betBear');
};

// Function for Bull betting
const betBull = async () => {
  await checkBalances();
  await bet(privateKeybull, 'betBull');
};

// Call both betting functions at different intervals
setInterval(betBear, 6 * 59 * 1000);
setInterval(betBull, 6 * 59 * 1000);
