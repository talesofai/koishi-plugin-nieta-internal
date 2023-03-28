import { Context, Schema } from 'koishi'
import { NodeSSH } from 'node-ssh'

export const name = 'nieta-internal'

const ServerConfig = Schema.object({
  name: Schema.string().required(),
  user: Schema.string().required().default('root'),
  host: Schema.string().required().default('region-3.seetacloud.com'),
  port: Schema.number().required(),
  password: Schema.string().required(),
  webuiPath: Schema.string().required().default('~/autodl-tmp/webui'),
  webuiURL: Schema.string(),
  webuiLaunchCmd: Schema.string().default('/root/miniconda3/envs/xl_env/bin/python launch.py --ckpt-dir /root/autodl-nas/ckpt_models --no-half-vae --port 6006 --enable-insecure-extension-access --api --embeddings-dir /root/autodl-nas/embeddings --lora-dir /root/autodl-nas/lora_models --vae-path /root/autodl-nas/vae/anything-v4.0.vae.pt --controlnet-dir /root/autodl-nas/sd-webui-controlnet/models --xformers --vae-dir /root/autodl-nas/vae/ --share'),
})

export interface Config {
  servers: Array<InstanceType<typeof ServerConfig>>
}

export const Config: Schema<Config> = Schema.object({
  servers: Schema.array(ServerConfig).description('Server SSH client')
})


export function apply(ctx: Context, config: Config) {
  ctx.command('webui.list').action(() => WebuiListCmdCallback(config))
  ctx.command('webui.status').action(async () => await WebuiStatusCallback(config))
  ctx.command('webui.restart <server:string>').action(async (_, server) => await WebuiRestartCallback(config, server))
}

function WebuiListCmdCallback(config: Config) {
  if (config.servers.length === 0) {
    return 'no configed servers'
  }

  return config.servers.map(s => `${s.name}: ${s.webuiURL}`).join('\n')
}

async function WebuiStatusCallback(config: Config) {
  const ssh = new NodeSSH()
  let ret = []
  for (var s of config.servers) {
    await ssh.connect({
      host: s.host,
      port: s.port,
      username: s.user,
      password: s.password,
    })

    let lastImage = await ssh.execCommand(`
      export dir1=$(find ${s.webuiPath}/outputs/txt2img-images -type d -name '????-??-??' | sort -r | head -n 1) &&
      export dir2=$(find ${s.webuiPath}/outputs/img2img-images -type d -name '????-??-??' | sort -r | head -n 1) &&
      find "$dir1" "$dir2" -type f -exec stat -c \'%y %n\' {} \\; | sort -r | head -n 1 | awk -F'/' '{print substr($1, 1, 16)}'
    `)

    let runStatus = '进程没找到，可以重启试下'
    const etime = (await ssh.execCommand("pgrep -f 'launch.*webui' | head -n 1 | xargs ps -o etime= -p")).stdout
    if (etime) {
      runStatus = `运行时长为 ${etime}`
    }

    ret.push(`
==== ${s.name} ====
webui 进程状态：${runStatus}
最近使用时间：${lastImage.stdout}`)
  }

  return ret.join('\n')
}

async function WebuiRestartCallback(config: Config, server: string) {
  let sc: InstanceType<typeof ServerConfig>

  config.servers.forEach(s => {
    if (s.name == server) {
      sc = s
    }
  })

  if (!sc) {
    return `server not found ${server}`
  }

  const ssh = new NodeSSH()
  await ssh.connect({
    host: sc.host,
    port: sc.port,
    username: sc.user,
    password: sc.password,
  })

  await ssh.execCommand("pgrep -f 'launch.*webui' | head -n 1 | xargs kill")
  await ssh.execCommand(`cd ${sc.webuiPath} && nohup ${sc.webuiLaunchCmd} &`)

  return `${server} 重启中，请等待一分钟……`
}
