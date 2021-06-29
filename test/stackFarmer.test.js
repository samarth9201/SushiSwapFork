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
        await stackFarmer.deposit(0, 1000, { from: accounts[0] }) // if BlockNumber = n

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

        /** 
         * Block Number = n + 10
         * Rewards Accumulated in 10 blocks = 10 * 3 = 30
         * Since User1 is the only user, he gets all rewards.
         * */ 

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 30, "Incorrect Reward")

        await stackFarmer.distributeReward(0, 33, { from: accounts[0] }) // Block Number = n + 11, thus rewards = 33

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

        stackFarmer = await StackFarmer.new(stackToken.address, 30, 0, 100)

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
         * After 3 blocks, reward to be distributed = 30 * 3 = 90. Sice user 1 is the 
         * only user to provide lp, he gets all rewards
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 90, "Incorrect Reward")

        await stackFarmer.deposit(0, 2000, { from: accounts[1], gas: 3000000 }) // BlockNumber = n + 4

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 7, i.e 7 blocks after User1's deposit and 3 blocks after User2's deposit.
         * After 7 blocks,
         * total lpSupply = 3000
         * rewardsAccumulated since Block n + 3 = 4 * 30 = 120
         * Since User2 deposited in (n + 4)th Block, User1 will get all rewards of fourth block.
         * User1's rewards = 90 (Accumulted Previously) + 30 ((n + 4)th block's reward) + (1000/3000)*3*30 = 150
         * User2's rewards = (1000/3000) * 90 = 60
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 150)

        var rewards = await stackFarmer.pendingStack(0, accounts[1])
        assert.equal(rewards.toNumber(), 60)

        await stackFarmer.deposit(0, 3000, { from: accounts[2], gas: 3000000 }) // BlockNumber = n + 8

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 11, i.e 11 blocks after User1's deposit and 7 blocks after User2's deposit, 
         * 3 blocks after User3's deposit.
         * After 11 blocks,
         * total lpSupply = 6000
         * rewardsAccumulated since Block n + 7 = 4 * 30 = 120
         * Since User3 deposited in (n + 8)th Block, User1 and User2 will get all rewards of (n + 8)th block.
         * User1's rewards = 150 + (1000/3000)*30 + (1000/6000)*90 = 175
         * User2's rewards = 60 + (2000/3000)*30 + (2000/6000)*90= 110
         * User3's rewards = (3000/6000)*90 = 45
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 175, "Incorrect Rewards")

        var rewards = await stackFarmer.pendingStack(0, accounts[1])
        assert.equal(rewards.toNumber(), 110, "Incorrect Rewards")

        var rewards = await stackFarmer.pendingStack(0, accounts[2])
        assert.equal(rewards.toNumber(), 45, "Incorrect Rewards")
    })

    it("Should correctly distribute rewards when someone unstakes there tokens", async () =>{

        stackFarmer = await StackFarmer.new(stackToken.address, 30, 0, 100)

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
         * After 3 blocks, reward to be distributed = 30 * 3 = 90. Sice user 1 is the 
         * only user to provide lp, he gets all rewards
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 90, "Incorrect Reward")

        await stackFarmer.deposit(0, 2000, { from: accounts[1], gas: 3000000 }) // BlockNumber = n + 4

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 7, i.e 7 blocks after User1's deposit and 3 blocks after User2's deposit.
         * After 7 blocks,
         * total lpSupply = 3000
         * rewardsAccumulated since Block n + 3 = 4 * 30 = 120
         * Since User2 deposited in (n + 4)th Block, User1 will get all rewards of fourth block.
         * User1's rewards = 90 (Accumulted Previously) + 30 ((n + 4)th block's reward) + (1000/3000)*3*30 = 150
         * User2's rewards = (1000/3000) * 90 = 60
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 150)

        var rewards = await stackFarmer.pendingStack(0, accounts[1])
        assert.equal(rewards.toNumber(), 60)

        await stackFarmer.deposit(0, 3000, { from: accounts[2], gas: 3000000 }) // BlockNumber = n + 8

        for (i = 0; i < 3; i++) {
            await helper.advanceBlock()
        }

        /**
         * BlockNumber = n + 11, i.e 11 blocks after User1's deposit and 7 blocks after User2's deposit, 
         * 3 blocks after User3's deposit.
         * After 11 blocks,
         * total lpSupply = 6000
         * rewardsAccumulated since Block n + 7 = 4 * 30 = 120
         * Since User3 deposited in (n + 8)th Block, User1 and User2 will get all rewards of (n + 8)th block.
         * User1's rewards = 150 + (1000/3000)*30 + (1000/6000)*90 = 175
         * User2's rewards = 60 + (2000/3000)*30 + (2000/6000)*90= 110
         * User3's rewards = (3000/6000)*90 = 45
         */

        var rewards = await stackFarmer.pendingStack(0, accounts[0])
        assert.equal(rewards.toNumber(), 175, "Incorrect Rewards")

        var rewards = await stackFarmer.pendingStack(0, accounts[1])
        assert.equal(rewards.toNumber(), 110, "Incorrect Rewards")

        var rewards = await stackFarmer.pendingStack(0, accounts[2])
        assert.equal(rewards.toNumber(), 45, "Incorrect Rewards")

        await stackFarmer.withdraw(0, 2000, {from: accounts[1]}) // Block Number = n + 12

        /**
         * Rewards:
         * User1 = 175 + (1000/6000)*30 = 180
         * User2 = 110 + (2000/6000) * 30 = 120
         * User3 = 45 + (3000/6000) * 30 = 60
         */

        var userInfo = await stackFarmer.userInfo(0, accounts[1])
        assert.equal(userInfo.amount, 0, "Withdraw Unsucessfull")

        for (i = 0; i < 8; i++) {
            await helper.advanceBlock()
        }

        /**
         * Block Number = n + 22
         * Expected Rewards:
         * User1 = 180 + (1000/4000) * 30 * 8 = 240
         * User2 = 0
         * User3 = 60 + (3000/4000) * 30 * 8 = 240
         */

         var rewards = await stackFarmer.pendingStack(0, accounts[0])
         assert.equal(rewards.toNumber(), 240, "Incorrect Rewards")
 
         var rewards = await stackFarmer.pendingStack(0, accounts[2])
         assert.equal(rewards.toNumber(), 240, "Incorrect Rewards")
    })
})