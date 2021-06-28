const StackToken = artifacts.require("stackToken")
const StackFarmer = artifacts.require('stackFarmer')

const helper = require("./helper/truffleTestHelper");


contract("stackFarmer", accounts => {
    let stackToken;
    let stackFarmer;


    beforeEach('Setup contracts for testing', async () => {
        stackToken = await StackToken.new("LPA", "LPA", 1000000000)
        stackFarmer = await StackFarmer.new(stackToken.address, 3, 0, 100)
    })

    it("Should correctly deploy Token Contract", async () => {
        const name = await stackToken.name()
        const symbol = await stackToken.symbol()
        const totalSupply = await stackToken.totalSupply()
        const balance = await stackToken.balanceOf(accounts[0])
        assert.equal(name, "LPA", "Incorrect Name")
        assert.equal(symbol, "LPA", "Incorrect Symbol")
        assert.equal(totalSupply, 1000000000, "Incorrect Supply")
        assert.equal(balance.toString(), totalSupply.toString(), "Incorrect Balance of Owner")
    })

    it("Should correctly deploy stackFarmer Contract", async () => {

        const stack = await stackFarmer.stack();
        const bonusEndBlock = await stackFarmer.bonusEndBlock();
        const stackPerBlock = await stackFarmer.stackPerBlock();
        const startBlock = await stackFarmer.startBlock()

        assert.equal(stack, stackToken.address, "Invalid Token Address")
        assert.equal(startBlock.toNumber(), 0, "Invalid Start Block")
        assert.equal(bonusEndBlock.toNumber(), 100, "Invalid bonusEndBlock")
        assert.equal(stackPerBlock.toNumber(), 3, "Invalid Stack per Block")
    })

    it("Should correctly distribute rewards when only one user deposit", async () => {

        await stackToken.approve(stackFarmer.address, 10000, { from: accounts[0] })
        await stackFarmer.add(3, stackToken.address, true)

        const totalAllocPoint = await stackFarmer.totalAllocPoint()
        const poolLength = await stackFarmer.poolLength()

        assert.equal(totalAllocPoint.toNumber(), 3, "Incorrect totalAllocPoint")
        assert.equal(poolLength.toNumber(), 1, "Incorrect Pool Length")

        await stackFarmer.addRewards(1000, { from: accounts[0] })
        await stackFarmer.deposit(0, 1000, { from: accounts[0] })

        userInfo = await stackFarmer.userInfo(0, accounts[0])
        assert.equal(userInfo.amount.toNumber(), 1000, "Invalid Amount Deposited")

        const balance = await stackToken.balanceOf(stackFarmer.address)
        assert.equal(balance.toNumber(), 2000, "Tokens not transferred")

        const depositedRewards = await stackFarmer.rewards()
        assert.equal(depositedRewards.toNumber(), 1000, "Incorrect Rewards Added")

        // Advance 10 blocks
        for (i = 0; i < 10; i++) {
            await helper.advanceBlock()
        }

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 30, "Incorrect Reward")

        await stackFarmer.distributeReward(0, 33, { from: accounts[0] })

        rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 0, "Incorrect Rewards distributed")

        try {
            await stackFarmer.distributeReward(0, 33, { from: accounts[0] })
        } catch (error) {
            assert(error != null)
        }

        await stackFarmer.withdraw(0, 1000)

        userInfo = await stackFarmer.userInfo(0, accounts[0])
        assert.equal(userInfo.amount.toNumber(), 0, "Withdraw Unsucessfull")
    })

    it('Should correctly distribute rewards when multiple users deposit in multiple blocks', async () => {

        await stackToken.transfer(accounts[1], 2000, { from: accounts[0] })
        await stackToken.transfer(accounts[2], 3000, { from: accounts[0] })

        await stackFarmer.add(3, stackToken.address, true)

        await stackToken.approve(stackFarmer.address, 10000, { from: accounts[0] })
        await stackToken.approve(stackFarmer.address, 2000, { from: accounts[1] })
        await stackToken.approve(stackFarmer.address, 3000, { from: accounts[2] })

        await stackFarmer.addRewards(1000, { from: accounts[0] })
        const depositedRewards = await stackFarmer.rewards()
        assert.equal(depositedRewards.toNumber(), 1000, "Incorrect Rewards Added")

        await stackFarmer.deposit(0, 1000, { from: accounts[0], gas: 3000000 }) // if BlockNumber = n

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 3, i.e 3 blocks after User1 deposited.
         * After 3 blocks, reward to be distributed = 3 * 3 = 9. Sice user 1 is the 
         * only user to provide lp, he gets all rewards
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 9, "Incorrect Reward")

        await stackFarmer.deposit(0, 2000, { from: accounts[1], gas: 3000000 }) // BlockNumber = n + 4

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 7, i.e 7 blocks after User1's deposit and 3 blocks after User2's deposit.
         * After 7 blocks,
         * total lpSupply = 3000
         * rewardsAccumulated since Block n + 3 = 4 * 3 = 12
         * Since User2 deposited in (n + 4)th Block, User1 will get all rewards of fourth block.
         * User1's rewards = 9 (Accumulted Previously) + 3 ((n + 4)th block's reward) + (1000/3000)*3*3 = 15
         * User2's rewards = (1000/3000) * 9 = 6
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 15)

        var rewards = await stackFarmer.pendingStack(0, accounts[1])
        assert.equal(rewards.toNumber(), 6)

        await stackFarmer.deposit(0, 3000, { from: accounts[2], gas: 3000000 }) // BlockNumber = n + 8

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 11, i.e 11 blocks after User1's deposit and 7 blocks after User2's deposit, 
         * 3 blocks after User3's deposit.
         * After 11 blocks,
         * total lpSupply = 6000
         * rewardsAccumulated since Block n + 7 = 4 * 3 = 12
         * Since User3 deposited in (n + 8)th Block, User1 and User2 will get all rewards of (n + 8)th block.
         * User1's rewards = 15 + (1000/3000)*3 + (1000/6000)*9 = 17.5 ~ 17
         * User2's rewards = 6 + (2000/3000)*3 + (2000/6000)*9= 11
         * User3's rewards = (3000/6000)*9 = 4.5 ~ 4
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 17, "Incorrect Rewards")

        var rewards = await stackFarmer.pendingStack(0, accounts[1])
        assert.equal(rewards.toNumber(), 11, "Incorrect Rewards")

        var rewards = await stackFarmer.pendingStack(0, accounts[2])
        assert.equal(rewards.toNumber(), 4, "Incorrect Rewards")
        //assert.equal(rewards.toNumber(), 18, "Incorrect Reward")
    })
})