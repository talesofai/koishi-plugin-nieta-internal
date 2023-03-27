import { Context, Schema } from 'koishi'
import { NodeSSH } from 'node-ssh'

export const name = 'nieta-internal'

const SERVER_CONFIG_TYPE = Schema.object({
  name: Schema.string().required(),
  user: Schema.string().required(),
  host: Schema.string().required(),
  port: Schema.number().required(),
  privateKey: Schema.string().required(),
  webuiPath: Schema.string().default('~/autodl-tmp/stable-diffusion-webui'),
})

export interface Config {
  servers: any[]
}

export const Config: Schema<Config> = Schema.object({
  servers: Schema.array(SERVER_CONFIG_TYPE).description('Server SSH client')
})


export function apply(ctx: Context, config: Config) {
  ctx.command('webui.list').action(() => WebuiListCmdCallback(config))
  ctx.command('webui.status').action(async () => await WebuiStatusCallback(config))
}

function WebuiListCmdCallback(config: Config) {
  if (config.servers.length === 0) {
    return 'no configed servers'
  }

  return config.servers.map(s => `${s.name}: ${s.user}@${s.host}:${s.port}`).join('\n')
}

async function WebuiStatusCallback(config: Config) {
  const ssh = new NodeSSH()
  let ret = []
  for (var s of config.servers) {
    await ssh.connect({
      host: s.host,
      port: s.port,
      username: s.user,
      privateKey: s.privateKey,
    })
    let result = await ssh.execCommand(`
      export dir1=$(find ${s.webuiPath}/outputs/txt2img-images -type d -name '????-??-??' | sort -r | head -n 1) &&
      export dir2=$(find ${s.webuiPath}/outputs/img2img-images -type d -name '????-??-??' | sort -r | head -n 1) &&
      find "$dir1" "$dir2" -type f -exec stat -c \'%y %n\' {} \\; | sort -r | head -n 1 | awk -F'/' '{print substr($1, 1, 16) " " $NF}'
    `)
    ret.push(`==== ${s.name} ====\n最近使用时间：${result.stdout}`)
  }

  return ret.join('\n')
}