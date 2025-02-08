import fs from 'fs';
import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import chalk from 'chalk';

const readLines = (filename, addPrefix = false) => {
    try {
        const lines = fs.readFileSync(filename, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line);
            
        if (addPrefix) {
            return lines.map(address => address.startsWith('0x') ? address : `0x${address}`);
        }
        return lines;
    } catch (error) {
        console.error(chalk.red(`[ERROR] Failed to read ${filename}: ${error.message}`));
        process.exit(1);
    }
};

const formatProxy = (proxyString) => {
    try {
        const url = new URL(proxyString);
        return {
            host: url.hostname,
            port: url.port,
            auth: {
                username: url.username,
                password: url.password
            }
        };
    } catch (error) {
        console.error(chalk.red(`[ERROR] Failed to parse proxy URL: ${proxyString}`));
        process.exit(1);
    }
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkEligibility(address, proxy) {
    try {
        const proxyUrl = `socks5://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`;
        const agent = new SocksProxyAgent(proxyUrl);
        
        const response = await axios.get(`https://www.blastbera.fun/api/check-eligibility?address=${address}`, {
            httpAgent: agent,
            httpsAgent: agent,
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            timeout: 30000,
            maxRedirects: 5,
            proxy: false
        });
        
        return { success: true, data: response.data };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data?.message || error.message 
        };
    }
}

class WorkerPool {
    constructor(proxies, results, totalAddresses) {
        this.proxies = proxies;
        this.results = results;
        this.totalAddresses = totalAddresses;
        this.currentIndex = 0;
        this.processedAddresses = new Set();
        this.mutex = false;
    }

    async log(message) {
        while (this.mutex) await sleep(10);
        this.mutex = true;
        console.log(message);
        this.mutex = false;
    }

    async processAddress(workerId, address) {
        if (!address || this.processedAddresses.has(address)) return;
        this.processedAddresses.add(address);

        const proxy = this.proxies[workerId % this.proxies.length];
        const result = await checkEligibility(address, proxy);

        let output = '';
        if (!result.success) {
            output = chalk.red(`[ERROR] ${address} | ${result.error}`);
            this.results.errors.push(address);
        } else if (result.data.isEligible) {
            output = chalk.green(`[SUCCESS] ${address} | Allocation Blast: ${result.data.allocation}`);
            this.results.totalEligible++;
            this.results.totalAllocation += parseInt(result.data.rawAllocation);
            this.results.eligibleAddresses.push(address);
            this.results.detailedEligible.push({
                address,
                allocation: result.data.allocation
            });
        } else {
            output = chalk.gray(`[INFO] ${address} | Not Eligible`);
        }

        const progress = ((this.processedAddresses.size / this.totalAddresses) * 100).toFixed(2);
        output += chalk.yellow(` | Progress: ${progress}%`);
        
        await this.log(output);
    }

    getNextAddress() {
        if (this.currentIndex >= this.totalAddresses) return null;
        return this.addresses[this.currentIndex++];
    }

    async startWorker(workerId, addresses) {
        this.addresses = addresses;
        
        while (true) {
            const address = this.getNextAddress();
            if (!address) break;
            await this.processAddress(workerId, address);
            await sleep(200);
        }
    }

    async start(workerCount, addresses) {
        const workers = [];
        for (let i = 0; i < workerCount; i++) {
            workers.push(this.startWorker(i, addresses));
        }
        await Promise.all(workers);
    }
}

async function main() {
    //потоки
    const WORKER_COUNT = 10;

    console.log(chalk.blue('\n' + '='.repeat(80)));
    console.log(chalk.yellow(' BLAST ERA TOKEN ELIGIBILITY CHECKER'));
    console.log(chalk.blue('='.repeat(80) + '\n'));

    const addresses = readLines('addresses.txt', true);
    const proxies = readLines('proxies.txt').map(line => {
        const cleanProxy = line.startsWith('0x') ? line.slice(2) : line;
        return formatProxy(cleanProxy);
    });
    
    const results = {
        totalEligible: 0,
        totalAllocation: 0,
        errors: [],
        eligibleAddresses: [],
        detailedEligible: []
    };

    console.log(chalk.yellow(`[INFO] Starting check with ${WORKER_COUNT} workers`));
    console.log(chalk.yellow(`[INFO] Loaded ${addresses.length} addresses to check\n`));

    const pool = new WorkerPool(proxies, results, addresses.length);
    await pool.start(WORKER_COUNT, addresses);

    if (results.eligibleAddresses.length > 0) {
        fs.writeFileSync('eligible.txt', results.eligibleAddresses.join('\n'));
        
        const detailedContent = results.detailedEligible
            .map(item => `${item.address} | ${item.allocation}`)
            .join('\n');
        fs.writeFileSync('eligible_detailed.txt', detailedContent);
    }

    if (results.errors.length > 0) {
        fs.writeFileSync('errors.txt', results.errors.join('\n'));
    }

    console.log(chalk.blue('\n' + '='.repeat(80)));
    console.log(chalk.yellow(' SUMMARY'));
    console.log(chalk.blue('='.repeat(80)));
    console.log(chalk.green(`[SUCCESS] Total eligible addresses: ${results.totalEligible}`));
    console.log(chalk.green(`[SUCCESS] Total allocation Blast: ${results.totalAllocation.toLocaleString()}`));
    console.log(chalk.red(`[ERROR] Total errors: ${results.errors.length}`));
    
    if (results.eligibleAddresses.length > 0) {
        console.log(chalk.green(`\n[SUCCESS] Eligible addresses saved to:`));
        console.log(chalk.green(`  - eligible.txt (addresses only)`));
        console.log(chalk.green(`  - eligible_detailed.txt (addresses with allocation)`));
    }

    if (results.errors.length > 0) {
        console.log(chalk.red(`\n[ERROR] Failed addresses saved to errors.txt`));
    }

    console.log(chalk.blue('\n' + '='.repeat(80)));
}

main().catch(error => {
    console.error(chalk.red(`[ERROR] Fatal error: ${error.message}`));
    process.exit(1);
});